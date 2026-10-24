"""Durable, serialized, replayable PIM publications without a Kafka dependency."""
import argparse
import logging
import time
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from bson import Int64
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from market_catalog import graph
from market_catalog.config import mongo
from market_catalog.pim import PimError, UnoPim, approved, digest, validate

LOG = logging.getLogger('product-sync')


class StalePublication(PimError):
    pass


def bson(value):
    if type(value) is int:
        return Int64(value)
    if isinstance(value, dict):
        return {k: bson(v) for k, v in value.items()}
    if isinstance(value, list):
        return [bson(v) for v in value]
    return value


class Worker:
    def __init__(self, client=None):
        self.client = client or mongo()
        self.db = self.client.market_catalog
        self.owner = str(uuid4())

    def configure(self):
        self.db.products.create_index([('active', 1), ('category', 1), ('brand', 1), ('price_cents', 1), ('product_id', 1)], name='catalog_filters')
        self.db.products.create_index([('name', 'text'), ('sku', 'text'), ('brand', 'text'), ('description', 'text')], name='catalog_search')
        self.db.sync_jobs.create_index([('product_id', 1), ('publication_version', 1)], unique=True)
        self.db.sync_jobs.create_index([('state', 1), ('next_attempt_at', 1)])
        self.db.sync_errors.create_index('created_at')
        graph.query('CREATE CONSTRAINT product_id_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.product_id IS UNIQUE')

    @contextmanager
    def lock(self):
        instant = datetime.now(UTC)
        try:
            lease = self.db.sync_locks.find_one_and_update(
                {'_id': 'catalog', '$or': [{'expires_at': {'$lt': instant}}, {'owner': self.owner}]},
                {'$set': {'owner': self.owner, 'expires_at': instant + timedelta(minutes=5)}},
                upsert=True, return_document=ReturnDocument.AFTER)
        except DuplicateKeyError:
            raise RuntimeError('Another product synchronization is running') from None
        try:
            yield lease
        finally:
            self.db.sync_locks.update_one({'_id': 'catalog', 'owner': self.owner},
                                         {'$set': {'expires_at': datetime.now(UTC)}})

    def error(self, product_id, error, version=None):
        code = type(error).__name__
        self.db.sync_errors.insert_one({'product_id': product_id, 'publication_version': version,
            'error_code': code, 'reason': str(error)[:200] if isinstance(error, PimError) else code,
            'created_at': datetime.now(UTC)})
        LOG.error('Product synchronization rejected/failed: product_id=%s version=%s code=%s', product_id, version, code)

    def publish(self, document):
        validate(document)
        with self.lock():
            return self._publish(document)

    def _publish(self, document):
        pid, version = document['product_id'], document['publication_version']
        document_hash = digest(document)
        current = self.db.products.find_one({'product_id': pid})
        job_id = f'{pid}:{version}'
        previous_job = self.db.sync_jobs.find_one({'_id': job_id})
        if previous_job and previous_job['digest'] != document_hash:
            raise StalePublication('A publication version cannot have two contents')
        if current:
            if current['sku'] != document['sku']:
                raise StalePublication('Product identity is immutable')
            old_version = current['publication_version']
            if version < old_version or document['source_revision'] < current.get('source_revision', 0):
                raise StalePublication('Stale publication rejected')
            if version == old_version:
                if current.get('publication_digest'):
                    if current['publication_digest'] != document_hash:
                        raise StalePublication('Changed content requires a new publication version')
                    if current.get('sync_state') == 'READY':
                        if previous_job and previous_job['state'] != 'COMPLETE':
                            # Recover a crash after both projections acknowledged the revision
                            # but before the final journal acknowledgement was persisted.
                            self.complete(job_id)
                        return 'unchanged'
                else:
                    # Adopt the Phase 2 snapshot only if every existing source-owned value agrees.
                    for key, value in document.items():
                        if key in current:
                            actual = current[key]
                            if isinstance(actual, datetime):
                                value = datetime.fromisoformat(value)
                            if actual != value:
                                raise StalePublication('PIM does not match the initial seed snapshot')
            elif document['source_revision'] <= current.get('source_revision', 0):
                raise StalePublication('Source revision must increase for changed publications')
            elif document['source_version'] == current['source_version']:
                raise StalePublication('A changed source revision needs a new source version')
            if version > old_version and datetime.fromisoformat(document['published_at']) < current['published_at']:
                raise StalePublication('Publication timestamp must not move backwards')
        if self.db.products.find_one({'sku': document['sku'], 'product_id': {'$ne': pid}}):
            raise StalePublication('SKU belongs to a different product ID')
        self.db.sync_jobs.update_one({'_id': job_id}, {'$setOnInsert': {
            'product_id': pid, 'publication_version': version, 'digest': document_hash,
            'document': bson(document), 'created_at': datetime.now(UTC), 'attempts': 0, 'state': 'PENDING'}}, upsert=True)
        self.db.sync_jobs.update_one({'_id': job_id}, {'$inc': {'attempts': 1}, '$set': {'state': 'PENDING'}})
        try:
            projection = bson(dict(document, publication_digest=document_hash, sync_state='PENDING'))
            projection['published_at'] = datetime.fromisoformat(document['published_at'])
            # A pending projection is hidden by the read API until BOTH stores acknowledge the revision.
            self.db.products.replace_one({'product_id': pid}, projection, upsert=True)
            published = {p['product_id']: p for p in self.db.products.find({'sync_state': 'READY'})}
            incoming = dict(document, publication_digest=document_hash)
            published[pid] = incoming
            graph.sync_product(incoming, published)
            self.db.products.update_one({'product_id': pid, 'publication_digest': document_hash}, {'$set': {'sync_state': 'READY'}})
            self.complete(job_id)
            LOG.info('Published product_id=%s publication_version=%s', pid, version)
            return 'published'
        except Exception as exc:
            attempts = self.db.sync_jobs.find_one({'_id': job_id})['attempts']
            self.db.sync_jobs.update_one({'_id': job_id}, {'$set': {'state': 'ERROR', 'error_code': type(exc).__name__,
                'next_attempt_at': datetime.now(UTC) + timedelta(seconds=min(300, 2 ** min(attempts, 8)))}})
            self.error(pid, exc, version)
            raise

    def complete(self, job_id):
        self.db.sync_jobs.update_one({'_id': job_id}, {'$set': {'state': 'COMPLETE', 'completed_at': datetime.now(UTC)},
                                                    '$unset': {'error_code': '', 'next_attempt_at': ''}})

    def run_once(self):
        pim = UnoPim()
        failures = 0
        author_total, managed_total, unapproved_total = 0, 0, 0
        rejected_products = set()
        try:
            # Re-read PIM on every cycle; never publish an unapproved draft.
            for source in pim.products():
                author_total += 1
                if 'mh_product_id' not in source.get('values', {}).get('common', {}):
                    continue
                managed_total += 1
                pid = source['values']['common'].get('mh_product_id')
                try:
                    document = approved(source)
                    if document:
                        job = self.db.sync_jobs.find_one({'_id': f"{document['product_id']}:{document['publication_version']}"})
                        if job and job.get('next_attempt_at') and job['next_attempt_at'] > datetime.now(UTC):
                            continue
                        self.publish(document)
                    else:
                        unapproved_total += 1
                except Exception as exc:  # noqa: BLE001 -- durable worker records failure and continues
                    failures += 1
                    rejected_products.add(str(pid))
                    self.error(pid, exc)
            # Publish only a COMPLETE PIM enumeration. An interrupted scan must retain
            # the prior observation, which the read API marks stale after 120 seconds.
            # No extra PIM request, credentials or product mutation is introduced.
            self.db.sync_status.update_one({'_id': 'authoring'}, {'$set': {
                'observed_at': datetime.now(UTC), 'author_total': author_total,
                'managed_total': managed_total, 'unapproved_total': unapproved_total,
                'rejected_product_ids': sorted(rejected_products),
            }}, upsert=True)
            # Previously approved durable snapshots can finish if the current PIM row is now a draft.
            pending = self.db.sync_jobs.find({'state': {'$in': ['PENDING', 'ERROR']},
                '$or': [{'next_attempt_at': {'$lte': datetime.now(UTC)}}, {'next_attempt_at': {'$exists': False}}]})
            for job in pending:
                try:
                    self.publish(job['document'])
                except StalePublication:
                    self.db.sync_jobs.update_one({'_id': job['_id']}, {'$set': {'state': 'SUPERSEDED'}})
                except Exception:  # noqa: BLE001 -- retry boundary
                    failures += 1
            return failures + self.db.sync_jobs.count_documents({'state': {'$in': ['PENDING', 'ERROR']}})
        finally:
            pim.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
    worker = Worker()
    worker.configure()
    while True:
        try:
            failures = worker.run_once()
            if args.once:
                raise SystemExit(1 if failures else 0)
            worker.db.sync_status.update_one({'_id': 'worker'}, {'$set': {'checked_at': datetime.now(UTC), 'failures': failures}}, upsert=True)
        except SystemExit:
            raise
        except Exception as exc:  # noqa: BLE001 -- durable worker records failure and continues
            LOG.error('Synchronization cycle failed: %s', type(exc).__name__)
            if args.once:
                raise SystemExit(1) from None
        time.sleep(15)


if __name__ == '__main__':
    main()
