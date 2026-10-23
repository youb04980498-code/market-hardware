"""Real gateway, restricted PostgreSQL roles, process crashes and Kafka recovery.

All commerce writes use separate development users and dedicated test warehouses.
Historical fixtures are never rewritten/deleted. Sensitive responses are never printed.
"""
import hashlib
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import httpx
import jwt
import psycopg
import pytest
from confluent_kafka import Consumer
from dotenv import dotenv_values

from data.seeds.phase2 import pg
from market_commerce.common import ROOT, connection, fingerprint, now
from market_commerce.outbox import Publisher, consume_once

BASE = 'http://127.0.0.1:8080'


def docker(*arguments, expected=0):
    result = subprocess.run(['docker', 'compose', '--profile', 'catalog', '--profile', 'commerce',
        '--profile', 'streaming', *arguments], cwd=ROOT, capture_output=True, text=True,
        encoding='utf-8', errors='replace', check=False)
    if result.returncode != expected:
        pytest.fail(f'Docker command failed: {arguments[0]}, exit={result.returncode}, expected={expected}')
    return result.stdout


def request(method, path, token=None, body=None, key=None, expected=(200,)):
    headers = {'X-Correlation-ID': str(uuid4())}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if key:
        headers['Idempotency-Key'] = str(key)
    response = httpx.request(method, BASE + path, json=body, headers=headers, timeout=30, trust_env=False)
    if response.status_code not in expected:
        # Avoid printing tokens/passwords even when an auth assertion fails.
        try:
            code = response.json().get('error', {}).get('code', 'UNKNOWN')
        except ValueError:
            code = 'NON_JSON_RESPONSE'
        pytest.fail(f'{method} {path} HTTP {response.status_code}; expected={expected}; code={code}')
    return response


def login(username, password):
    return request('POST', '/api/auth/login', body={'username': username, 'password': password}).json()


@pytest.fixture(scope='module')
def commerce():
    config = dotenv_values(ROOT / '.env')
    tokens = {name.lower(): login(config['DEV_' + name + '_EMAIL'], config['DEV_' + name + '_PASSWORD'])['access_token']
              for name in ['ADMIN', 'CUSTOMER', 'OTHER']}
    users = {name: request('GET', '/api/auth/me', token).json() for name, token in tokens.items()}
    wid = request('POST', '/api/inventory/warehouses', tokens['admin'],
        {'name': 'Phase4 verification ' + str(uuid4()), 'city': 'Local tests', 'capacity_units': 1000000}, expected=(201,)).json()['warehouse_id']
    for pid in [1001, 1002]:
        request('POST', '/api/inventory/adjustments', tokens['admin'],
                {'product_id': pid, 'warehouse_id': wid, 'delta': 1000, 'reason': 'Isolated verification stock'}, key=uuid4())
    return {'config': config, 'tokens': tokens, 'users': users, 'warehouse': wid}


def checkout(c, simulation='success', fault=None, quantity=1, warehouse=None, key=None, who='customer', ttl=900):
    key = key or str(uuid4())
    if simulation != 'success' or fault or ttl != 900:
        request('POST', '/api/orders/testing/plans', c['tokens']['admin'],
            {'user_id': c['users'][who]['user_id'], 'idempotency_key': key,
             'simulation': simulation, 'fault': fault, 'reservation_ttl': ttl}, expected=(201,))
    body = {'items': [{'product_id': 1001, 'quantity': quantity}], 'warehouse_id': warehouse or c['warehouse']}
    result = request('POST', '/api/orders', c['tokens'][who], body, key=key, expected=(200, 201, 202)).json()
    return result, key, body


def wait_order(c, oid, status=None, timeout=60):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = request('GET', f'/api/orders/{oid}', c['tokens']['admin']).json()
        if last['complete'] and (status is None or last['status'] == status):
            return last
        time.sleep(0.25)
    pytest.fail(f'Order {oid} did not complete: status={last and last["status"]}, step={last and last["saga"]["step"]}')


def stock(c, pid=1001, warehouse=None):
    rows = request('GET', f'/api/inventory/products/{pid}/warehouses', c['tokens']['admin']).json()['items']
    return next(r for r in rows if r['warehouse_id'] == (warehouse or c['warehouse']))


def catalogue_fingerprint():
    from market_catalog.config import mongo
    from market_catalog.graph import query
    with mongo('read') as client:
        products = list(client.market_catalog.products.find({}, {'_id': 0}).sort('product_id', 1))
    nodes = query('MATCH (p:Product) RETURN properties(p) AS p ORDER BY p.product_id')
    return fingerprint({'products': products, 'nodes': nodes})


def test_gateway_openapi_health_and_catalogue(commerce):
    for service in ['auth', 'orders', 'inventory', 'payments']:
        assert request('GET', '/api/' + service + '/health').json()['status'] == 'ok'
        request('GET', '/api/' + service + '/docs')
        schema = request('GET', '/api/' + service + '/openapi.json').json()
        assert schema['paths'] and not any(p.startswith('/internal') for p in schema['paths'])
        assert 'HTTPBearer' in schema['components']['securitySchemes']
    result = request('POST', '/graphql', body={'query': '{products{total} product(id:"900001",includeInactive:true){active} compatibleProducts(productId:"1001",category:MOTHERBOARD){product{productId}}}'}).json()['data']
    assert result['products']['total'] == 42
    assert result['product']['active'] is False
    assert result['compatibleProducts']
    from market_catalog.graph import query
    assert query("MATCH ()-[r:COMPATIBLE]->() WHERE r.validation_status='RULE_VALIDATED' RETURN count(r) AS n")[0]['n'] == 163


def test_registration_login_sessions_and_rotation(commerce):
    unique = str(uuid4())
    password = 'TestOnly-' + str(uuid4())
    username = 'phase4-' + unique
    user = request('POST', '/api/auth/register', body={'username': username, 'email': unique + '@example.test',
        'password': password, 'first_name': 'Verification', 'last_name': 'Account'}, expected=(201,)).json()
    assert user['roles'] == ['customer']
    pair = login(username, password)
    request('POST', '/api/auth/login', body={'username': username, 'password': 'incorrect-password'}, expected=(401,))
    second = request('POST', '/api/auth/refresh', body={'refresh_token': pair['refresh_token']}).json()
    assert fingerprint(pair['refresh_token']) != fingerprint(second['refresh_token'])
    request('GET', '/api/auth/me', pair['access_token'], expected=(401,))
    request('POST', '/api/auth/refresh', body={'refresh_token': pair['refresh_token']}, expected=(401,))
    request('GET', '/api/auth/me', second['access_token'], expected=(401,))
    third = login(username, password)
    request('POST', '/api/auth/logout', body={'refresh_token': third['refresh_token']})
    request('GET', '/api/auth/me', third['access_token'], expected=(401,))
    with pg() as conn:
        row = conn.execute('SELECT password_hash,is_active FROM auth.users WHERE user_id=%s', (user['user_id'],)).fetchone()
        assert row['password_hash'].startswith('$argon2id$') and row['is_active']
        assert conn.execute('SELECT token_hash FROM auth.refresh_sessions WHERE user_id=%s', (user['user_id'],)).fetchall()


def test_browser_cookie_refresh_rotation_and_logout():
    unique = str(uuid4())
    password = 'CookieOnly-' + str(uuid4())
    username = 'cookie-' + unique
    request('POST', '/api/auth/register', body={'username': username, 'email': unique + '@example.test',
        'password': password, 'first_name': 'Cookie', 'last_name': 'Session'}, expected=(201,))
    with httpx.Client(base_url=BASE, timeout=30, trust_env=False) as browser:
        signed_in = browser.post('/api/auth/login', json={'username': username, 'password': password})
        assert signed_in.status_code == 200
        first_access = signed_in.json()['access_token']
        first_cookie = browser.cookies.get('market_refresh')
        cookie_header = signed_in.headers['set-cookie'].lower()
        assert first_cookie and 'httponly' in cookie_header and 'samesite=strict' in cookie_header
        assert 'path=/api/auth' in cookie_header
        assert browser.cookies.get('market_session') == '1'

        rotated = browser.post('/api/auth/refresh', json={})
        assert rotated.status_code == 200
        second_access = rotated.json()['access_token']
        assert browser.cookies.get('market_refresh') not in (None, first_cookie)
        assert browser.get('/api/auth/me', headers={'Authorization': 'Bearer ' + first_access}).status_code == 401
        assert browser.get('/api/auth/me', headers={'Authorization': 'Bearer ' + second_access}).status_code == 200

        signed_out = browser.post('/api/auth/logout', json={})
        assert signed_out.status_code == 200 and browser.cookies.get('market_refresh') is None
        assert browser.cookies.get('market_session') is None
        assert browser.get('/api/auth/me', headers={'Authorization': 'Bearer ' + second_access}).status_code == 401


@pytest.mark.parametrize('kind', ['expired', 'issuer', 'audience'])
def test_jwt_claim_validation(commerce, kind):
    config = commerce['config']
    claims = jwt.decode(commerce['tokens']['customer'], config['JWT_SECRET'], algorithms=['HS256'],
                        audience='market-commerce', issuer='market-hardware')
    claims.update({'exp': now() - timedelta(seconds=2)} if kind == 'expired' else {'iss': 'wrong'} if kind == 'issuer' else {'aud': 'wrong'})
    token = jwt.encode(claims, config['JWT_SECRET'], algorithm='HS256')
    request('GET', '/api/orders', token, expected=(401,))


def test_disabled_fixtures_and_secret_safe_validation():
    with pg() as conn:
        fixture = conn.execute("SELECT username FROM auth.users WHERE password_hash LIKE '!disabled%' LIMIT 1").fetchone()
        assert conn.execute("SELECT count(*) AS n FROM auth.users WHERE password_hash LIKE '!disabled%' AND is_active").fetchone()['n'] == 0
    request('POST', '/api/auth/login', body={'username': fixture['username'], 'password': '!disabled_fixture_not_a_password'}, expected=(401,))
    response = request('POST', '/api/auth/login', body={'username': 'x', 'password': 'sensitive-do-not-echo', 'extra': True}, expected=(422,))
    assert 'sensitive-do-not-echo' not in response.text


def test_successful_checkout_and_price_snapshot(commerce):
    catalogue_before = catalogue_fingerprint()
    before = stock(commerce)
    key = str(uuid4())
    body = {'items': [{'product_id': 1001, 'quantity': 2, 'unit_price_cents': 1}], 'warehouse_id': commerce['warehouse']}
    order = request('POST', '/api/orders', commerce['tokens']['customer'], body, key=key, expected=(201, 202)).json()
    order = wait_order(commerce, order['order_id'], 'PAID')
    assert order['total_cents'] == order['items'][0]['unit_price_cents'] * 2
    assert order['items'][0]['unit_price_cents'] > 1
    assert order['items'][0]['sku'] == 'MH-CPU-1001' and order['items'][0]['currency'] == 'EUR'
    payment = request('GET', f"/api/payments/{order['saga']['payment_id']}", commerce['tokens']['customer']).json()
    assert payment['status'] == 'SUCCEEDED' and payment['amount_cents'] == order['total_cents']
    after = stock(commerce)
    assert after['quantity'] == before['quantity'] - 2 and after['reserved_quantity'] == before['reserved_quantity']
    with pg() as conn:
        assert conn.execute("SELECT count(*) AS n FROM inventory.reservations WHERE order_id=%s AND status='COMMITTED'", (order['order_id'],)).fetchone()['n'] == 1
        kinds = {r['event_type'] for r in conn.execute('SELECT event_type FROM orders.outbox_events WHERE aggregate_id=%s', (str(order['order_id']),))}
        assert {'order.created', 'order.confirmed'} <= kinds
        ids = set()
        for owner in ['orders', 'inventory', 'payments']:
            ids.update(r['correlation_id'] for r in conn.execute('SELECT correlation_id FROM '+owner+'.outbox_events WHERE payload->>\'order_id\'=%s', (str(order['order_id']),)))
        assert len(ids) == 1
    assert request('POST', '/api/payments', commerce['tokens']['customer'], {'order_id': order['order_id']}).json()['payment_id'] == payment['payment_id']
    request('POST', '/api/payments', commerce['tokens']['customer'], {'order_id': order['order_id'], 'amount_cents': 1}, expected=(409,))
    assert catalogue_fingerprint() == catalogue_before


def test_ownership_rbac_and_internal_routes(commerce):
    order, _, _ = checkout(commerce)
    order = wait_order(commerce, order['order_id'], 'PAID')
    request('GET', f"/api/orders/{order['order_id']}", commerce['tokens']['other'], expected=(404,))
    request('GET', f"/api/payments/{order['saga']['payment_id']}", commerce['tokens']['other'], expected=(403,))
    request('GET', '/api/orders?all_customers=true', commerce['tokens']['customer'], expected=(403,))
    request('POST', '/api/inventory/adjustments', commerce['tokens']['customer'],
        {'product_id': 1001, 'warehouse_id': commerce['warehouse'], 'delta': 1, 'reason': 'not authorized'}, key=uuid4(), expected=(403,))
    request('POST', f"/api/payments/{order['saga']['payment_id']}/refund", commerce['tokens']['customer'],
        {'amount_cents': order['total_cents']}, key=uuid4(), expected=(403,))
    request('POST', '/api/inventory/reservations', commerce['tokens']['customer'],
        {'order_id': order['order_id'], 'items': [{'product_id': 1001, 'warehouse_id': commerce['warehouse'], 'quantity': 1}]}, expected=(403,))
    request('GET', f"/internal/orders/{order['order_id']}", commerce['tokens']['admin'], expected=(404,))
    request('POST', '/api/orders/testing/plans', commerce['tokens']['customer'],
        {'user_id': commerce['users']['customer']['user_id'], 'idempotency_key': str(uuid4())}, expected=(403,))


@pytest.mark.parametrize('items', [[], [{'product_id': 1001, 'quantity': 0}], [{'product_id': 1001, 'quantity': -1}],
    [{'product_id': 1001, 'quantity': True}], [{'product_id': 99999999, 'quantity': 1}],
    [{'product_id': 900001, 'quantity': 1}], [{'product_id': 1001, 'quantity': 1}, {'product_id': 1001, 'quantity': 1}]])
def test_invalid_or_unpublished_cart(commerce, items):
    request('POST', '/api/orders', commerce['tokens']['customer'],
        {'items': items, 'warehouse_id': commerce['warehouse']}, key=uuid4(), expected=(422,))


def test_customer_cannot_select_simulation(commerce):
    request('POST', '/api/orders', commerce['tokens']['customer'],
        {'items': [{'product_id': 1001, 'quantity': 1}], 'simulation': 'success'}, key=uuid4(), expected=(422,))
    request('POST', '/api/payments', commerce['tokens']['customer'],
        {'order_id': 1, 'simulation': 'success'}, expected=(422,))


def test_checkout_idempotency_and_conflicting_payload(commerce):
    before = stock(commerce)['quantity']
    order, key, body = checkout(commerce)
    duplicate = request('POST', '/api/orders', commerce['tokens']['customer'], body, key=key).json()
    assert duplicate['order_id'] == order['order_id']
    body['items'][0]['quantity'] = 2
    request('POST', '/api/orders', commerce['tokens']['customer'], body, key=key, expected=(409,))
    assert stock(commerce)['quantity'] == before - 1
    with pg() as conn:
        assert conn.execute('SELECT count(*) AS n FROM payments.payments WHERE order_id=%s', (order['order_id'],)).fetchone()['n'] == 1


def test_cart_validation_reads_real_stock_without_reserving(commerce):
    before = stock(commerce)
    for quantity, valid in [(1, True), (9999, False)]:
        body = {'items': [{'product_id': 1001, 'quantity': quantity, 'unit_price_cents': 1}], 'warehouse_id': commerce['warehouse']}
        result = request('POST', '/api/orders/cart/validate', commerce['tokens']['customer'], body).json()
        assert result['valid'] is valid and result['items'][0]['unit_price_cents'] > 1
    after = stock(commerce)
    assert after['quantity'] == before['quantity'] and after['reserved_quantity'] == before['reserved_quantity']


def test_concurrent_duplicate_checkouts(commerce):
    key = str(uuid4())
    body = {'items': [{'product_id': 1001, 'quantity': 1}], 'warehouse_id': commerce['warehouse']}
    before = stock(commerce)['quantity']
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: request('POST', '/api/orders', commerce['tokens']['customer'], body,
            key=key, expected=(200, 201, 202)).json(), range(4)))
    ids = {r['order_id'] for r in responses}
    assert len(ids) == 1
    order = wait_order(commerce, ids.pop(), 'PAID')
    assert stock(commerce)['quantity'] == before - 1
    with pg() as conn:
        assert conn.execute("SELECT count(*) AS n FROM payments.financial_audit WHERE payment_id=%s AND operation='CAPTURE'", (order['saga']['payment_id'],)).fetchone()['n'] == 1


def test_last_unit_is_not_oversold(commerce):
    wid = request('POST', '/api/inventory/warehouses', commerce['tokens']['admin'],
        {'name': 'Final unit ' + str(uuid4()), 'city': 'Tests', 'capacity_units': 10}, expected=(201,)).json()['warehouse_id']
    request('POST', '/api/inventory/adjustments', commerce['tokens']['admin'],
        {'product_id': 1001, 'warehouse_id': wid, 'delta': 1, 'reason': 'Final-unit concurrency'}, key=uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda who: checkout(commerce, warehouse=wid, who=who)[0], ['customer', 'other']))
    states = [wait_order(commerce, r['order_id'])['status'] for r in results]
    assert sorted(states) == ['PAID', 'PAYMENT_FAILED']
    assert stock(commerce, warehouse=wid)['quantity'] == stock(commerce, warehouse=wid)['reserved_quantity'] == 0
    with pg() as conn:
        loser = results[states.index('PAYMENT_FAILED')]['order_id']
        assert conn.execute('SELECT count(*) AS n FROM payments.payments WHERE order_id=%s', (loser,)).fetchone()['n'] == 0


@pytest.mark.parametrize('simulation', ['decline', 'timeout_once', 'timeout_succeeded'])
def test_payment_outcomes_and_timeout_reconciliation(commerce, simulation):
    before = stock(commerce)
    initial, _, _ = checkout(commerce, simulation=simulation)
    if simulation.startswith('timeout'):
        assert initial['status'] not in ('PAYMENT_FAILED', 'CANCELLED')
    order = wait_order(commerce, initial['order_id'], 'PAYMENT_FAILED' if simulation == 'decline' else 'PAID')
    with pg() as conn:
        payment = conn.execute('SELECT * FROM payments.payments WHERE order_id=%s', (order['order_id'],)).fetchone()
        count = conn.execute("SELECT count(*) AS n FROM payments.financial_audit WHERE payment_id=%s AND operation='CAPTURE'", (payment['payment_id'],)).fetchone()['n']
        assert count == (0 if simulation == 'decline' else 1)
        assert payment['attempts'] == (2 if simulation == 'timeout_once' else 1)
    assert stock(commerce)['reserved_quantity'] == before['reserved_quantity']
    assert stock(commerce)['quantity'] == before['quantity'] - (0 if simulation == 'decline' else 1)


def test_compensation_failure_is_persisted_and_retried(commerce):
    before = stock(commerce)
    initial, _, _ = checkout(commerce, simulation='decline', fault='compensation_fail_once')
    wait_order(commerce, initial['order_id'], 'PAYMENT_FAILED')
    assert stock(commerce)['quantity'] == before['quantity']
    assert stock(commerce)['reserved_quantity'] == before['reserved_quantity']
    with pg() as conn:
        assert conn.execute("SELECT 1 FROM orders.saga_attempts WHERE order_id=%s AND outcome='RETRY:INJECTED_COMPENSATION_OUTAGE'", (initial['order_id'],)).fetchone()


@pytest.mark.parametrize('fault,expected', [('finalize_fail_once', 'PAID'), ('finalize_permanent', 'REFUNDED')])
def test_captured_payment_finalization_recovery_or_refund(commerce, fault, expected):
    initial, _, _ = checkout(commerce, fault=fault)
    order = wait_order(commerce, initial['order_id'], expected)
    payment = request('GET', f"/api/payments/{order['saga']['payment_id']}", commerce['tokens']['admin']).json()
    assert payment['status'] == ('SUCCEEDED' if expected == 'PAID' else 'REFUNDED')


@pytest.mark.parametrize('fault', ['crash_after_reserve', 'crash_after_payment', 'crash_after_finalize'])
def test_actual_worker_crash_restart_and_idempotent_recovery(commerce, fault):
    before = int(subprocess.check_output(['docker', 'inspect', 'market-hardware-checkout-saga-1', '--format', '{{.RestartCount}}'], text=True))
    initial, _, _ = checkout(commerce, fault=fault)
    order = wait_order(commerce, initial['order_id'], 'PAID', timeout=75)
    after = int(subprocess.check_output(['docker', 'inspect', 'market-hardware-checkout-saga-1', '--format', '{{.RestartCount}}'], text=True))
    assert after > before
    with pg() as conn:
        assert conn.execute("SELECT count(*) AS n FROM payments.financial_audit WHERE payment_id=%s AND operation='CAPTURE'", (order['saga']['payment_id'],)).fetchone()['n'] == 1
        assert conn.execute('SELECT count(*) AS n FROM inventory.reservations WHERE order_id=%s', (order['order_id'],)).fetchone()['n'] == 1
        assert conn.execute("SELECT 1 FROM orders.saga_attempts WHERE order_id=%s AND outcome='STARTED'", (order['order_id'],)).fetchone()


def test_expiry_and_double_release(commerce):
    before = stock(commerce)
    initial, _, _ = checkout(commerce, fault='pause_after_reserve', ttl=1)
    with pg() as conn:
        assert conn.execute("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name LIKE 'market-%' AND state='idle in transaction' AND xact_start<now()-interval '1 second'").fetchone()['n'] == 0
    time.sleep(1.1)
    request('POST', '/api/inventory/expire', commerce['tokens']['admin'])
    order = wait_order(commerce, initial['order_id'], 'CANCELLED')
    with pg() as conn:
        reservation_id = conn.execute('SELECT reservation_id FROM inventory.reservations WHERE order_id=%s', (order['order_id'],)).fetchone()['reservation_id']
    for _ in range(2):
        request('POST', f'/api/inventory/reservations/{reservation_id}/release', commerce['tokens']['admin'])
    assert stock(commerce)['quantity'] == before['quantity']
    assert stock(commerce)['reserved_quantity'] == before['reserved_quantity']


def test_cancel_idempotency_and_finalized_order_rejection(commerce):
    initial, _, _ = checkout(commerce, fault='pause_after_reserve')
    for _ in range(2):
        request('POST', f"/api/orders/{initial['order_id']}/cancel", commerce['tokens']['customer'], expected=(200, 202))
    assert wait_order(commerce, initial['order_id'], 'CANCELLED')['complete']
    paid, _, _ = checkout(commerce)
    request('POST', f"/api/orders/{paid['order_id']}/cancel", commerce['tokens']['customer'], expected=(409,))


def test_cancel_ambiguous_captured_payment_reconciles_before_refund(commerce):
    initial, _, _ = checkout(commerce, simulation='timeout_succeeded')
    request('POST', f"/api/orders/{initial['order_id']}/cancel", commerce['tokens']['customer'], expected=(200, 202))
    result = wait_order(commerce, initial['order_id'], 'REFUNDED')
    payment = request('GET', f"/api/payments/{result['saga']['payment_id']}", commerce['tokens']['admin']).json()
    assert payment['status'] == 'REFUNDED' and payment['attempts'] == 1


def test_live_pim_price_change_preserves_purchase_snapshot(commerce):
    from market_catalog.pim import UnoPim, approved
    order, _, _ = checkout(commerce)
    order = wait_order(commerce, order['order_id'], 'PAID')
    frozen = order['items'][0]['unit_price_cents']
    pim = UnoPim()
    original = approved(pim.product('MH-CPU-1001'))
    docker('stop', 'product-sync')

    def publish_price(price):
        source = approved(pim.product('MH-CPU-1001'))
        version = source['publication_version'] + 1
        pim.patch('MH-CPU-1001', {'mh_price_cents': str(price), 'mh_source_revision': str(source['source_revision']+1),
            'mh_source_version': 'phase4-price-verification-' + str(version), 'mh_publication_version': str(version),
            'mh_approval_status': 'DRAFT', 'mh_approved_hash': ''})
        pim.approve('MH-CPU-1001')
        docker('run', '--rm', '--no-deps', 'product-sync', 'python', '-m', 'market_catalog.sync', '--once')

    try:
        publish_price(original['price_cents'] + 100)
        published = request('POST', '/graphql', body={'query': '{product(id:"1001"){priceCents}}'}).json()['data']['product']['priceCents']
        assert published == original['price_cents'] + 100
        assert request('GET', f"/api/orders/{order['order_id']}", commerce['tokens']['customer']).json()['items'][0]['unit_price_cents'] == frozen
        with connection('orders') as conn, pytest.raises(psycopg.errors.CheckViolation):
            conn.execute('UPDATE orders.order_items SET unit_price_cents=unit_price_cents+1 WHERE order_id=%s', (order['order_id'],))
    finally:
        publish_price(original['price_cents'])
        pim.close()
        docker('up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'product-sync')


def test_refunds_idempotency_limits_failure_and_audit(commerce):
    initial, _, _ = checkout(commerce, simulation='refund_fail_once')
    order = wait_order(commerce, initial['order_id'], 'PAID')
    pid = order['saga']['payment_id']
    key = str(uuid4())
    amount = order['total_cents'] // 2
    request('POST', f'/api/payments/{pid}/refund', commerce['tokens']['admin'], {'amount_cents': amount}, key=key, expected=(503,))
    first = request('POST', f'/api/payments/{pid}/refund', commerce['tokens']['admin'], {'amount_cents': amount}, key=key).json()
    again = request('POST', f'/api/payments/{pid}/refund', commerce['tokens']['admin'], {'amount_cents': amount}, key=key).json()
    assert first['refund_id'] == again['refund_id']
    request('POST', f'/api/payments/{pid}/refund', commerce['tokens']['admin'], {'amount_cents': amount+1}, key=key, expected=(409,))
    request('POST', f'/api/payments/{pid}/refund', commerce['tokens']['admin'], {'amount_cents': order['total_cents']}, key=uuid4(), expected=(409,))
    remaining = order['total_cents'] - amount
    # Each refund identity has its own deterministic first provider failure in this scenario.
    last_key = str(uuid4())
    request('POST', f'/api/payments/{pid}/refund', commerce['tokens']['admin'], {'amount_cents': remaining}, key=last_key, expected=(503,))
    request('POST', f'/api/payments/{pid}/refund', commerce['tokens']['admin'], {'amount_cents': remaining}, key=last_key)
    assert request('GET', f'/api/payments/{pid}', commerce['tokens']['admin']).json()['status'] == 'REFUNDED'
    assert request('GET', f"/api/orders/{order['order_id']}", commerce['tokens']['admin']).json()['status'] == 'REFUNDED'
    with pg() as conn:
        assert conn.execute("SELECT sum(amount_cents) AS n FROM payments.financial_audit WHERE payment_id=%s AND operation='REFUND'", (pid,)).fetchone()['n'] == order['total_cents']


@pytest.mark.parametrize('service', ['auth', 'orders', 'inventory', 'payments'])
def test_runtime_roles_are_not_superusers_or_cross_schema_readers(service):
    with connection(service) as conn:
        assert conn.execute('SELECT rolsuper FROM pg_roles WHERE rolname=current_user').fetchone()['rolsuper'] is False
        target = 'auth.users' if service != 'auth' else 'orders.orders'
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute('SELECT * FROM ' + target)


def test_outbox_atomic_rollback_and_runtime_cannot_ack(commerce):
    with connection('orders') as conn:
        customer_id = request('GET', '/api/orders', commerce['tokens']['customer']).json()['items'][0]['customer_id']
        oid = conn.execute("INSERT INTO orders.orders(customer_id,status,total_cents) VALUES(%s,'PENDING',0) RETURNING order_id", (customer_id,)).fetchone()['order_id']
        row = conn.execute('SELECT * FROM orders.outbox_events WHERE aggregate_id=%s', (str(oid),)).fetchone()
        assert row and row['aggregate_type'] == 'order' and row['causation_id'] is None  # Raw SQL has no command context.
        conn.rollback()
        assert conn.execute('SELECT count(*) AS n FROM orders.outbox_events WHERE event_id=%s', (row['event_id'],)).fetchone()['n'] == 0
        conn.rollback()
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute('UPDATE orders.outbox_events SET published_at=now() WHERE false')


def new_event():
    eid = uuid4()
    with connection('auth') as conn:
        conn.execute('''INSERT INTO auth.outbox_events(event_id,event_type,event_version,aggregate_id,aggregate_type,payload,correlation_id,occurred_at)
            VALUES(%s,'auth.verification',1,'verification','user','{}',%s,now())''', (eid, uuid4()))
    return eid


def event_row(eid):
    with pg() as conn:
        return conn.execute('SELECT * FROM auth.outbox_events WHERE event_id=%s', (eid,)).fetchone()


def consume(eid, minimum=1):
    consumer = Consumer({'bootstrap.servers': '127.0.0.1:9092', 'group.id': 'phase4-' + str(uuid4()),
        'auto.offset.reset': 'earliest', 'enable.auto.commit': False})
    consumer.subscribe(['market.auth.v1'])
    matches = []
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and len(matches) < minimum:
            message = consumer.poll(0.25)
            if message and not message.error():
                value = json.loads(message.value())
                if value['event_id'] == str(eid):
                    matches.append(value)
    finally:
        consumer.close()
    assert len(matches) >= minimum
    return matches


def test_kafka_unavailable_then_restored_keeps_durable_event():
    eid = new_event()
    docker('stop', 'kafka')
    try:
        assert Publisher(enabled=False).once('auth', eid) == 0
        assert Publisher(enabled=True).once('auth', eid) == 0
        row = event_row(eid)
        assert row['published_at'] is None and row['delivery_attempts'] == 1 and row['last_error']
    finally:
        docker('up', '-d', '--wait', '--wait-timeout', '120', 'kafka')
    assert Publisher(enabled=True).once('auth', eid) == 1
    row = event_row(eid)
    assert row['published_at'] and row['kafka_offset'] is not None
    consume(eid)


def test_two_publishers_claim_once():
    eid = new_event()
    publishers = [Publisher(enabled=True), Publisher(enabled=True)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(lambda p: p.claim('auth', eid), publishers))
    assert sum(row is not None for row in claims) == 1
    index = next(i for i, row in enumerate(claims) if row is not None)
    assert publishers[index].deliver('auth', claims[index])


def test_outbox_envelopes_match_versioned_contract():
    from jsonschema import Draft202012Validator, FormatChecker

    from market_commerce.outbox import envelope
    schema = json.loads((ROOT / 'data/contracts/events/market.commerce.v1.schema.json').read_text())
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    with pg() as conn:
        for owner in ['auth', 'orders', 'inventory', 'payments']:
            rows = conn.execute('SELECT * FROM '+owner+".outbox_events WHERE aggregate_type<>'legacy' LIMIT 100").fetchall()
            assert rows
            for row in rows:
                validator.validate(envelope(row, owner))


def test_crash_after_kafka_ack_redelivers_and_inbox_deduplicates():
    eid = new_event()
    docker('run', '--rm', '--no-deps', '-e', 'KAFKA_ENABLED=1', 'outbox-publisher', 'python', '-m',
        'market_commerce.outbox', '--once', '--schema', 'auth', '--event-id', str(eid), '--crash-after-ack', expected=74)
    row = event_row(eid)
    assert row['published_at'] is None and row['claim_owner']
    assert Publisher(enabled=True).claim('auth', eid) is None
    deadline = time.monotonic() + 20
    publisher = Publisher(enabled=True)
    while time.monotonic() < deadline:
        if publisher.once('auth', eid):
            break
        time.sleep(0.25)
    assert event_row(eid)['published_at'] is not None
    duplicates = consume(eid, minimum=2)
    name = 'phase4-inbox-' + str(uuid4())
    assert consume_once(name, duplicates[0]) is True
    assert consume_once(name, duplicates[1]) is False


def test_auth_rate_limit_without_affecting_gateway_clients():
    # Loopback inside the Auth container is a separate limiter bucket from Traefik's IP.
    bucket = hashlib.sha256(b'login:127.0.0.1').hexdigest()
    with pg() as conn:
        conn.execute('''INSERT INTO auth.rate_limits(bucket,window_start,hits) VALUES(%s,%s,60)
            ON CONFLICT(bucket) DO UPDATE SET window_start=excluded.window_start,hits=excluded.hits''',
            (bucket, int(time.time()) // 60))
    code = "import httpx; c=httpx.Client(trust_env=False); code=c.post('http://127.0.0.1:8080/api/auth/login',json={'username':'rate-limit-nonexistent','password':'incorrect-value'}).status_code; print('RATE_LIMIT_PASS' if code==429 else 'FAIL')"
    assert 'RATE_LIMIT_PASS' in docker('exec', '-T', 'auth', 'python', '-c', code)


def test_no_credentials_in_service_logs(commerce):
    output = docker('logs', '--tail', '1000', 'auth', 'orders', 'inventory', 'payments', 'checkout-saga', 'outbox-publisher')
    values = [v for k, v in commerce['config'].items() if v and len(v)>12 and any(word in k for word in ['PASSWORD', 'SECRET'])]
    values += list(commerce['tokens'].values())
    if any(value in output for value in values):
        pytest.fail('A credential value was found in runtime logs')
