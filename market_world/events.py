"""Events invalidate HTTP snapshots; they NEVER project financial/business state."""
import hashlib
import json
import re
import threading
import time
from collections import OrderedDict
from datetime import datetime
from uuid import UUID, uuid4

TOPICS = tuple('market.' + owner + '.v1' for owner in ('orders', 'inventory', 'payments'))


class EventBus:
    def __init__(self):
        self.lock = threading.Lock()
        self.instance = str(uuid4())
        self.revision = 0
        self.seen = OrderedDict()
        self.connected = False
        self.last_event = None
        self.last_poll = 0.0
        self.worker_error = None
        self.rejected = self.duplicates = self.conflicts = 0

    def process(self, topic, value):
        """Successful processing includes explicit poison rejection; no payload is broadcast."""
        try:
            event = json.loads(value)
            UUID(event['event_id'])
            occurred = datetime.fromisoformat(event['occurred_at'])
            if topic not in TOPICS or event['source'] != topic.split('.')[1] or not occurred.tzinfo:
                raise ValueError('Invalid source or timestamp')
            if type(event['version']) is not int or event['version'] != 1 or not isinstance(event['payload'], dict):
                raise ValueError('Invalid envelope')
            prefixes = {'orders': ('order.',), 'inventory': ('inventory.',), 'payments': ('payment.', 'refund.')}
            if not isinstance(event['event_type'], str) or not event['event_type'].startswith(prefixes[event['source']]):
                raise ValueError('Invalid event type')
            if not re.fullmatch(r'[a-z]+\.[a-z_]{1,64}', event['event_type']):
                raise ValueError('Invalid event name')
            digest = hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()
        except (ValueError, KeyError, TypeError, AttributeError):
            with self.lock:
                self.rejected += 1
            return 'rejected'
        with self.lock:
            previous = self.seen.get(event['event_id'])
            if previous == digest:
                self.duplicates += 1
                return 'duplicate'
            if previous:
                self.conflicts += 1
            self.seen[event['event_id']] = digest
            self.seen.move_to_end(event['event_id'])
            if len(self.seen) > 4096:
                self.seen.popitem(last=False)
            # Older and conflicting events can only request a fresh authoritative HTTP read.
            self.revision += 1
            self.last_event = {'event_id': event['event_id'], 'type': event['event_type'], 'occurred_at': event['occurred_at']}
        return 'invalidate'

    def status(self):
        with self.lock:
            return {'instance': self.instance, 'revision': self.revision, 'broker_connected': self.connected,
                    'last_event': self.last_event, 'rejected': self.rejected, 'duplicates': self.duplicates,
                    'conflicts': self.conflicts, 'worker_error': self.worker_error,
                    'poll_recent': time.monotonic()-self.last_poll < 15}


def consume(bus, stop, config, factory=None):
    from confluent_kafka import Consumer
    group = config.get('WORLD_KAFKA_GROUP', 'market-3d-world-v1')
    if not group.startswith('market-3d-'):
        raise ValueError('The world must use a dedicated market-3d-* group')
    def error(_):
        with bus.lock:
            bus.connected = False
    consumer = (factory or Consumer)({'bootstrap.servers': config.get('KAFKA_BOOTSTRAP_SERVERS', '127.0.0.1:9092'),
        'group.id': group, 'enable.auto.commit': False, 'enable.auto.offset.store': False,
        'auto.offset.reset': 'earliest', 'allow.auto.create.topics': False, 'error_cb': error, 'log_level': 0,
        'session.timeout.ms': 10000})
    def assigned(client, partitions):
        with bus.lock:
            bus.connected = True
        client.assign(partitions)
    consumer.subscribe(list(TOPICS), on_assign=assigned)
    last_probe = 0.0
    try:
        while not stop.is_set():
            message = consumer.poll(.5)
            with bus.lock:
                bus.last_poll = time.monotonic()
            if time.monotonic()-last_probe > 10:
                last_probe = time.monotonic()
                try:
                    metadata = consumer.list_topics(timeout=2)
                    with bus.lock:
                        bus.connected = bool(metadata.brokers)
                        bus.worker_error = None
                except Exception:  # noqa: BLE001 -- isolated broker retry boundary; no payload logging
                    error(None)
            if message is None:
                continue
            if message.error():
                error(message.error())
                continue
            bus.process(message.topic(), message.value())
            # Never commit before processing. Failure rejoins from the last broker-committed offset.
            consumer.commit(message=message, asynchronous=False)
            with bus.lock:
                bus.connected = True
                bus.worker_error = None
    finally:
        consumer.close()
        with bus.lock:
            bus.connected = False
