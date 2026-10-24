"""Bridge correctness without private databases or fabricated public Kafka records."""
import asyncio
import json
import threading
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from market_world import api
from market_world.events import EventBus, consume


def event(**changes):
    return {'event_id':str(uuid4()), 'source':'orders', 'event_type':'order.confirmed',
            'version':1, 'occurred_at':'2026-10-24T10:00:00Z', 'payload':{'status':'PAID'}, **changes}


def test_duplicate_and_out_of_order_records_only_invalidate():
    bus = EventBus()
    latest = event()
    assert bus.process('market.orders.v1', json.dumps(latest)) == 'invalidate'
    assert bus.process('market.orders.v1', json.dumps(latest)) == 'duplicate'
    assert bus.status()['revision'] == 1
    assert bus.process('market.orders.v1', json.dumps(event(occurred_at='2025-01-01T00:00:00Z', payload={'status':'PENDING'}))) == 'invalidate'
    assert bus.status()['revision'] == 2
    assert 'payload' not in bus.status()['last_event']
    assert bus.process('market.orders.v1', json.dumps({**latest, 'payload':{'status':'CANCELLED'}})) == 'invalidate'
    assert bus.status()['conflicts'] == 1


@pytest.mark.parametrize('body', ['not-json', '{}', 'null', json.dumps(event(version=True)), json.dumps(event(source='payments'))])
def test_poison_records_are_explicitly_rejected(body):
    bus = EventBus()
    assert bus.process('market.orders.v1', body) == 'rejected'
    assert bus.status()['revision'] == 0
    assert bus.status()['rejected'] == 1


def test_offsets_commit_only_after_successful_processing():
    bus, stop = EventBus(), threading.Event()
    calls = []
    class Client:
        def __init__(self, config):
            assert config['group.id'] == 'market-3d-unit'
            assert config['enable.auto.commit'] is False
            assert config['enable.auto.offset.store'] is False
        def subscribe(self, topics, on_assign):
            assert isinstance(topics, list)
            on_assign(self, [])
        def assign(self, partitions):
            pass
        def list_topics(self, timeout):
            return SimpleNamespace(brokers={1:'local'})
        def poll(self, timeout):
            return SimpleNamespace(error=lambda:None, topic=lambda:'market.orders.v1', value=lambda:json.dumps(event()))
        def commit(self, message, asynchronous):
            assert bus.status()['revision'] == 1
            calls.append('commit')
            stop.set()
        def close(self):
            calls.append('close')
    consume(bus, stop, {'WORLD_KAFKA_GROUP':'market-3d-unit'}, Client)
    assert calls == ['commit', 'close']


def test_existing_consumer_groups_cannot_be_reused():
    with pytest.raises(ValueError, match='dedicated'):
        consume(EventBus(), threading.Event(), {'WORLD_KAFKA_GROUP':'spark-existing'})


def test_staff_guard_is_closed_to_anonymous_and_customer(monkeypatch):
    client = TestClient(api.app)
    assert client.get('/api/world/snapshot').status_code == 401
    async def customer(*args, **kwargs):
        return {'roles':['customer']}
    monkeypatch.setattr(api, 'read', customer)
    assert client.get('/api/world/snapshot', headers={'Authorization':'Bearer test'}).status_code == 403


def test_snapshot_is_partial_bounded_and_does_not_expose_customers(monkeypatch):
    async def source(service, path, token, body=None):
        if service == 'orders':
            return {'available':True,'data':{'items':[{'order_id':9,'status':'PAID','auth_user_id':17,'customer_email':'private@example.test'}],'total':999}}
        return {'available':False,'data':None,'error':'UNAVAILABLE'}
    monkeypatch.setattr(api, 'optional', source)
    snapshot = asyncio.run(api.snapshot(token='test'))
    assert snapshot['orders']['data']['truncated'] is True
    assert 'auth_user_id' not in snapshot['orders']['data']['items'][0]
    assert 'private@example.test' not in json.dumps(snapshot)
    assert snapshot['analytics']['available'] is False
    assert snapshot['cart_telemetry']['available'] is False


def test_every_stream_connection_requests_reconciliation():
    class Request:
        async def is_disconnected(self):
            return True
    async def first():
        response = await api.events(Request(), token='test')
        iterator = response.body_iterator
        value = await anext(iterator)
        await iterator.aclose()
        return value
    assert asyncio.run(first()).startswith('event: resync\n')


def test_upstream_failures_are_not_empty_successes(monkeypatch):
    async def failed(*args, **kwargs):
        raise httpx.ConnectError('unavailable')
    monkeypatch.setattr(api, 'read', failed)
    result = asyncio.run(api.optional('inventory','/api/inventory/warehouses','test'))
    assert result == {'available':False,'data':None,'error':'INVENTORY_UNAVAILABLE'}


def test_monitoring_uses_existing_optional_api_without_blocking_snapshot(monkeypatch):
    calls = []
    async def source(service, path, token, body=None):
        calls.append((service, path, token))
        return {'available': False, 'data': None, 'error': 'ANALYTICS_UNAVAILABLE'}
    monkeypatch.setattr(api, 'optional', source)
    assert asyncio.run(api.monitoring(token='staff'))['available'] is False
    assert calls == [('analytics', '/api/analytics/observability', 'staff')]
    calls.clear()
    asyncio.run(api.snapshot(token='staff'))
    assert not any('observability' in path for _, path, _ in calls)
