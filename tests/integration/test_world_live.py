"""Live read-only bridge/API/SSE checks. No business writes or synthetic Kafka publication."""
import hashlib
import json
import time

import httpx
import pytest
from dotenv import dotenv_values

from data.seeds.phase2 import ROOT, pg

BASE = 'http://127.0.0.1:8080'


@pytest.fixture(scope='module')
def tokens():
    config = dotenv_values(ROOT / '.env')
    result = {}
    for role in ('ADMIN','CUSTOMER'):
        response = httpx.post(BASE+'/api/auth/login', json={'username':config['DEV_'+role+'_EMAIL'],
            'password':config['DEV_'+role+'_PASSWORD']}, timeout=15, trust_env=False)
        assert response.status_code == 200, 'Login unavailable'
        result[role] = {'Authorization':'Bearer '+response.json()['access_token']}
    return result


def fingerprint():
    with pg() as conn:
        rows = [conn.execute('SELECT row_to_json(t) AS r FROM '+table+' t ORDER BY 1::text').fetchall()
                for table in ('orders.orders','orders.order_items','inventory.stock','inventory.reservations','payments.payments','payments.refunds')]
    # Stable serialization, independent of row return order. No business values are logged.
    return hashlib.sha256(json.dumps([sorted(json.dumps(row, sort_keys=True, default=str) for row in table) for table in rows]).encode()).hexdigest()


def test_readonly_snapshots_and_details_match_owned_services(tokens):
    before = fingerprint()
    with httpx.Client(base_url=BASE, headers=tokens['ADMIN'], timeout=30, trust_env=False) as client:
        snapshot = client.get('/api/world/snapshot').json()
        assert all(snapshot[k]['available'] for k in ('orders','warehouses','payments','catalog','analytics'))
        owned = client.get('/api/inventory/warehouses?include_test=true').json()
        assert snapshot['warehouses']['data']['items'] == owned['items']
        wid = owned['items'][0]['warehouse_id']
        stock = client.get(f'/api/world/warehouses/{wid}/stock').json()['data']
        assert stock == client.get(f'/api/inventory/warehouses/{wid}/stock').json()
        order = snapshot['orders']['data']['items'][0]
        assert 'auth_user_id' not in order and 'customer_id' not in order
        detail = client.get('/api/world/orders/'+str(order['order_id'])).json()
        assert detail['status'] == client.get('/api/orders/'+str(order['order_id'])).json()['status']
        assert detail['payments']['available'] is True
        assert snapshot['cart_telemetry']['available'] is False
        assert snapshot['physical_tracking'] is False
    assert fingerprint() == before


def test_new_reads_are_staff_only_and_validate_inputs(tokens):
    with httpx.Client(base_url=BASE, timeout=15, trust_env=False) as c:
        for path in ('/api/world/snapshot','/api/world/events','/api/inventory/warehouses/1/stock','/api/payments/states?order_ids=1'):
            assert c.get(path).status_code in (401,403)
            assert c.get(path,headers=tokens['CUSTOMER']).status_code == 403
        for path in ('/api/inventory/warehouses/1/stock?page_size=10001','/api/payments/states?order_ids=1,abc'):
            assert c.get(path,headers=tokens['ADMIN']).status_code == 422


def test_real_kafka_consumer_and_sse_reconnect(tokens):
    deadline = time.monotonic()+45
    with httpx.Client(base_url=BASE, headers=tokens['ADMIN'], timeout=15, trust_env=False) as c:
        while time.monotonic()<deadline:
            state=c.get('/api/world/health').json()['stream']
            if state['broker_connected'] and state['poll_recent']:
                break
            time.sleep(1)
        assert state['broker_connected'] and state['poll_recent']
        for _ in range(2):
            with c.stream('GET','/api/world/events') as response:
                assert response.status_code == 200
                assert response.headers['content-type'].startswith('text/event-stream')
                lines=response.iter_lines()
                assert next(lines) == 'event: resync'
                status=json.loads(next(lines).removeprefix('data: '))
                assert status['broker_connected'] is True
                assert 'payload' not in json.dumps(status)
