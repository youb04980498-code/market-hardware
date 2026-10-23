"""Kafka-acknowledged at-least-once outbox delivery with committed, expiring claims."""
import argparse
import json
import logging
import os
import time
from uuid import UUID, uuid4

from confluent_kafka import Producer
from psycopg import sql

from market_commerce.common import SCHEMAS, env, transaction

LOG = logging.getLogger('outbox-publisher')


def envelope(row, schema):
    return {'event_id': str(row['event_id']), 'event_type': row['event_type'], 'version': row['event_version'],
        'aggregate_id': row['aggregate_id'], 'aggregate_type': row['aggregate_type'],
        'occurred_at': row['occurred_at'].isoformat(), 'correlation_id': str(row['correlation_id']),
        'causation_id': str(row['causation_id']) if row['causation_id'] else None,
        'idempotency_key': row['idempotency_key'], 'source': schema, 'payload': row['payload']}


class Publisher:
    def __init__(self, enabled=None, bootstrap=None):
        config = env()
        self.enabled = config.get('KAFKA_ENABLED') == '1' if enabled is None else enabled
        self.owner = uuid4()
        self.producer = Producer({'bootstrap.servers': bootstrap or config.get('KAFKA_BOOTSTRAP_SERVERS', '127.0.0.1:9092'),
            'enable.idempotence': True, 'acks': 'all', 'message.timeout.ms': 5000,
            'socket.timeout.ms': 3000, 'client.id': 'market-outbox', 'log_level': 0}) if self.enabled else None

    def claim(self, schema, event_id=None):
        if schema not in SCHEMAS:
            raise ValueError('Unknown outbox owner')
        with transaction('outbox') as conn:
            row = conn.execute(sql.SQL('''SELECT * FROM {}.outbox_events
                WHERE published_at IS NULL AND next_attempt_at<=now()
                 AND (claim_until IS NULL OR claim_until<now())
                 AND (%s::uuid IS NULL OR event_id=%s)
                ORDER BY occurred_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1''').format(sql.Identifier(schema)), (event_id, event_id)).fetchone()
            if row is None:
                return None
            return conn.execute(sql.SQL('''UPDATE {}.outbox_events SET claim_owner=%s,claim_until=now()+interval '15 seconds',
                delivery_attempts=delivery_attempts+1 WHERE event_id=%s RETURNING *''').format(sql.Identifier(schema)), (self.owner, row['event_id'])).fetchone()

    def deliver(self, schema, row, crash_after_ack=False):
        # The claim transaction is already committed; no SQL row lock is held here.
        acknowledged = []

        def ack(error, message):
            acknowledged.append((error, message))

        try:
            self.producer.produce('market.' + schema + '.v1', key=row['aggregate_id'],
                value=json.dumps(envelope(row, schema), default=str).encode(), on_delivery=ack)
            remaining = self.producer.flush(7)
            if remaining or not acknowledged or acknowledged[0][0] is not None:
                raise RuntimeError('KAFKA_ACK_UNAVAILABLE')
            message = acknowledged[0][1]
            if crash_after_ack:
                if env().get('COMMERCE_TESTING') != '1':
                    raise RuntimeError('Crash injection disabled')
                os._exit(74)
            with transaction('outbox') as conn:
                conn.execute(sql.SQL('''UPDATE {}.outbox_events SET published_at=now(),last_error=NULL,
                    kafka_partition=%s,kafka_offset=%s,claim_owner=NULL,claim_until=NULL
                    WHERE event_id=%s AND claim_owner=%s AND published_at IS NULL''').format(sql.Identifier(schema)),
                    (message.partition(), message.offset(), row['event_id'], self.owner))
            return True
        except Exception as exc:  # noqa: BLE001 -- durable delivery boundary
            with transaction('outbox') as conn:
                conn.execute(sql.SQL('''UPDATE {}.outbox_events SET last_error=%s,
                    next_attempt_at=now()+(%s * interval '1 second'),claim_owner=NULL,claim_until=NULL
                    WHERE event_id=%s AND claim_owner=%s AND published_at IS NULL''').format(sql.Identifier(schema)),
                    (type(exc).__name__, min(60, 2 ** min(row['delivery_attempts'], 6)), row['event_id'], self.owner))
            LOG.warning('Kafka delivery pending schema=%s event_id=%s code=%s', schema, row['event_id'], type(exc).__name__)
            return False

    def once(self, schema=None, event_id=None, crash_after_ack=False):
        if not self.enabled:
            return 0
        count = 0
        for owner in [schema] if schema else sorted(SCHEMAS):
            for _ in range(25):
                row = self.claim(owner, event_id)
                if row is None:
                    break
                if not self.deliver(owner, row, crash_after_ack):
                    break
                count += 1
                if event_id:
                    return count
        return count


def consume_once(consumer_name, document):
    """Persistent inbox example for acceptance tests; future consumers own their own inbox/effect transaction."""
    with transaction('outbox') as conn:
        return conn.execute('''INSERT INTO monitoring.consumer_inbox(consumer_name,event_id,event_type)
            VALUES(%s,%s,%s) ON CONFLICT(consumer_name,event_id) DO NOTHING RETURNING event_id''',
            (consumer_name, document['event_id'], document['event_type'])).fetchone() is not None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--schema', choices=sorted(SCHEMAS))
    parser.add_argument('--event-id', type=UUID)
    parser.add_argument('--crash-after-ack', action='store_true')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    publisher = Publisher()
    while True:
        try:
            publisher.once(args.schema, args.event_id, args.crash_after_ack)
            with transaction('outbox') as conn:
                conn.execute('''INSERT INTO monitoring.worker_status(worker_name,state) VALUES('outbox',%s)
                    ON CONFLICT(worker_name) DO UPDATE SET checked_at=now(),state=excluded.state''',
                    ('polling' if publisher.enabled else 'queued',))
            if args.once:
                return
        except Exception as exc:  # noqa: BLE001 -- process recovery loop
            LOG.error('Outbox cycle failed: %s', type(exc).__name__)
            if args.once:
                raise SystemExit(1) from None
        time.sleep(2)


if __name__ == '__main__':
    main()
