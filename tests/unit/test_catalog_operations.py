from datetime import UTC, datetime, timedelta

from market_catalog.operations import summary


class Collection:
    def __init__(self, rows):
        self.rows = rows

    def find_one(self, query):
        return next((r for r in self.rows if all(r.get(k) == v for k, v in query.items())), None)

    def find(self, query, projection=None):
        return [r for r in self.rows if all(r.get(k) == v for k, v in query.items())]

    def count_documents(self, query):
        return len(self.find(query))


class Database:
    def __init__(self, now, source=True):
        self.sync_status = Collection([{'_id': 'worker', 'checked_at': now, 'failures': 0}] + ([
            {'_id': 'authoring', 'observed_at': now, 'author_total': 43, 'managed_total': 43,
             'unapproved_total': 1, 'rejected_product_ids': ['1001']}] if source else []))
        self.sync_jobs = Collection([{'state': 'ERROR', 'product_id': 1001},
            {'state': 'ERROR', 'product_id': 1002}, {'state': 'PENDING', 'product_id': 1003},
            {'state': 'COMPLETE', 'product_id': 1004}])
        self.products = Collection([{'active': True, 'sync_state': 'READY'},
            {'active': False, 'sync_state': 'READY'}, {'active': True, 'sync_state': 'PENDING'}])


def test_current_status_uses_author_population_and_deduplicates_error_products():
    now = datetime.now(UTC)
    result = summary(Database(now), now)
    assert result['author_total'] == 43 and result['published_active'] == 1
    assert result['published_inactive'] == 1 and result['pending_jobs'] == 1
    assert result['publication_errors'] == 2 and result['unapproved_total'] == 1
    assert result['pim_connected'] and not result['stale']


def test_missing_or_stale_pim_observations_are_not_fabricated_zero():
    now = datetime.now(UTC)
    missing = summary(Database(now, source=False), now)
    assert missing['author_total'] is None and missing['publication_errors'] is None
    assert missing['stale'] and not missing['pim_connected']
    stale = summary(Database(now - timedelta(seconds=121)), now)
    assert stale['author_total'] == 43 and stale['stale'] and not stale['worker_healthy']
