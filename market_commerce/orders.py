from decimal import Decimal
from typing import Literal

import httpx
from fastapi import Depends, Header, Response
from pydantic import BaseModel, ConfigDict, Field

from market_commerce.common import (
    authenticated,
    correlation,
    create_app,
    env,
    fail,
    fingerprint,
    internal,
    remote,
    require_staff,
    roles,
    transaction,
)

app = create_app('orders')
user_dependency = authenticated('orders')
USER = Depends(user_dependency)
REQUEST_KEY = Header(min_length=8, max_length=128)


class Item(BaseModel):
    model_config = ConfigDict(extra='forbid')
    product_id: int = Field(gt=0, le=2**63-1, strict=True)
    quantity: int = Field(gt=0, le=10000, strict=True)
    # Accepted as a client hint solely to demonstrate that it never sets the purchase price.
    unit_price_cents: int | None = Field(default=None, ge=0, strict=True)


class Checkout(BaseModel):
    model_config = ConfigDict(extra='forbid')
    items: list[Item] = Field(min_length=1, max_length=50)
    warehouse_id: int = Field(default=1, gt=0, strict=True)


class Plan(BaseModel):
    model_config = ConfigDict(extra='forbid')
    user_id: int = Field(gt=0)
    idempotency_key: str = Field(min_length=8, max_length=128)
    simulation: Literal['success', 'decline', 'timeout_once', 'timeout_succeeded', 'refund_fail_once'] = 'success'
    fault: Literal['pause_after_reserve', 'crash_after_reserve', 'crash_after_payment', 'crash_after_finalize',
                   'finalize_fail_once', 'finalize_permanent', 'compensation_fail_once'] | None = None
    reservation_ttl: int = Field(default=900, ge=1, le=900)


def read_order(order_id, user=None, internal_view=False):
    with transaction('orders') as conn:
        order = conn.execute('SELECT * FROM orders.orders WHERE order_id=%s', (order_id,)).fetchone()
        if order is None:
            fail(404, 'ORDER_NOT_FOUND', 'Order not found')
        if user and order['auth_user_id'] != user['user_id'] and not roles(user) & {'admin', 'staff'}:
            fail(404, 'ORDER_NOT_FOUND', 'Order not found')
        order['items'] = conn.execute('SELECT * FROM orders.order_items WHERE order_id=%s ORDER BY order_item_id', (order_id,)).fetchall()
        saga = conn.execute('SELECT * FROM orders.sagas WHERE order_id=%s', (order_id,)).fetchone()
        order['saga'] = saga if internal_view else {k: saga[k] for k in ['step', 'payment_id', 'attempts', 'failure_code', 'next_attempt_at']} if saga else None
        order['complete'] = saga is None or saga['step'] == 'DONE'
        return order


def catalogue(body):
    ids = [item.product_id for item in body.items]
    if len(set(ids)) != len(ids):
        fail(422, 'DUPLICATE_PRODUCT', 'Each product must appear once in the cart')
    definitions = ','.join(f'$p{i}:ID!' for i in range(len(ids)))
    fields = ' '.join(f'p{i}:product(id:$p{i}){{productId sku name priceCents currency active publicationVersion}}' for i in range(len(ids)))
    try:
        response = httpx.post(env().get('CATALOG_URL', 'http://catalog-graphql:8080/graphql'),
            json={'query': 'query(' + definitions + '){' + fields + '}',
                  'variables': {f'p{i}': str(pid) for i, pid in enumerate(ids)}},
            headers={'X-Correlation-ID': correlation()}, timeout=5, trust_env=False)
        response.raise_for_status()
        result = response.json()
        if result.get('errors'):
            raise ValueError('Catalogue failed')
    except (httpx.HTTPError, ValueError):
        fail(503, 'CATALOGUE_UNAVAILABLE', 'Published catalogue temporarily unavailable')
    lines = []
    currencies = set()
    total = Decimal(0)
    for index, item in enumerate(body.items):
        product = result['data'].get('p' + str(index))
        if not product or not product['active']:
            fail(422, 'PRODUCT_UNAVAILABLE', 'Every ordered product must be published and active')
        price = product['priceCents']
        if type(price) is not int or price < 0:
            fail(503, 'INVALID_CATALOGUE_PRICE', 'Catalogue price is invalid')
        total += Decimal(price) * Decimal(item.quantity)
        currencies.add(product['currency'])
        lines.append({'product_id': item.product_id, 'quantity': item.quantity, 'unit_price_cents': price,
            'sku': product['sku'], 'product_name': product['name'], 'currency': product['currency'],
            'publication_version': product['publicationVersion'], 'warehouse_id': body.warehouse_id})
    if len(currencies) != 1 or total > Decimal(1000000000000):
        fail(422, 'INVALID_TOTAL', 'Cart must have one currency and a supported total')
    return {'items': lines, 'total_cents': int(total), 'currency': currencies.pop()}


@app.post('/api/orders/cart/validate')
def validate_cart(body: Checkout, user=USER):
    result = catalogue(body)
    availability = remote('orders', 'inventory', 'POST', '/internal/availability',
        {'items': [{k: line[k] for k in ['product_id', 'warehouse_id', 'quantity']} for line in result['items']]})['items']
    return {**result, 'availability': availability, 'valid': all(line['sufficient'] for line in availability)}


@app.post('/api/orders/testing/plans', status_code=201)
def test_plan(body: Plan, user=USER):
    require_staff(user)
    if env().get('COMMERCE_TESTING') != '1':
        fail(404, 'NOT_FOUND', 'Testing controls are disabled')
    with transaction('orders') as conn:
        conn.execute('''INSERT INTO orders.test_plans(user_id,idempotency_key,simulation,fault,reservation_ttl)
            VALUES(%s,%s,%s,%s,%s) ON CONFLICT(user_id,idempotency_key) DO NOTHING''',
            (body.user_id, body.idempotency_key, body.simulation, body.fault, body.reservation_ttl))
    return {'status': 'configured'}


@app.post('/api/orders/{order_id}/testing/resume')
def test_resume(order_id: int, user=USER):
    require_staff(user)
    if env().get('COMMERCE_TESTING') != '1':
        fail(404, 'NOT_FOUND', 'Testing controls are disabled')
    with transaction('orders') as conn:
        conn.execute('UPDATE orders.sagas SET fault_consumed=true,next_attempt_at=now() WHERE order_id=%s', (order_id,))
    from market_commerce.saga import drive
    drive(order_id)
    return read_order(order_id, user)


@app.post('/api/orders', status_code=201)
def create_order(body: Checkout, response: Response, idempotency_key: str = REQUEST_KEY, user=USER):
    payload = body.model_dump()
    payload['items'] = sorted(payload['items'], key=lambda i: i['product_id'])
    request_hash = fingerprint(payload)
    with transaction('orders') as conn:
        prior = conn.execute('SELECT * FROM orders.checkout_requests WHERE user_id=%s AND idempotency_key=%s', (user['user_id'], idempotency_key)).fetchone()
    if prior:
        if prior['request_hash'] != request_hash:
            fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key identifies a different checkout')
        result = read_order(prior['order_id'], user)
        response.status_code = 200 if result['complete'] else 202
        return result
    snapshot = catalogue(body)  # No SQL locks/transaction is held during this HTTP call.
    with transaction('orders', idempotency_key) as conn:
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', (str(user['user_id']) + ':' + idempotency_key,))
        prior = conn.execute('SELECT * FROM orders.checkout_requests WHERE user_id=%s AND idempotency_key=%s', (user['user_id'], idempotency_key)).fetchone()
        if prior:
            if prior['request_hash'] != request_hash:
                fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key identifies a different checkout')
            oid = prior['order_id']
        else:
            customer = conn.execute('''INSERT INTO orders.customers(auth_user_id,first_name,last_name,email)
                VALUES(%s,%s,%s,%s) ON CONFLICT(auth_user_id) DO UPDATE SET auth_user_id=excluded.auth_user_id RETURNING customer_id''',
                (user['user_id'], user['first_name'], user['last_name'], user['email'])).fetchone()
            order = conn.execute('''INSERT INTO orders.orders(customer_id,auth_user_id,checkout_key,status,total_cents,currency)
                VALUES(%s,%s,%s,'PENDING',%s,%s) RETURNING order_id''',
                (customer['customer_id'], user['user_id'], idempotency_key, snapshot['total_cents'], snapshot['currency'])).fetchone()
            oid = order['order_id']
            for line in snapshot['items']:
                conn.execute('''INSERT INTO orders.order_items(order_id,product_id,quantity,unit_price_cents,sku,product_name,currency,publication_version,warehouse_id)
                    VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''', (oid, *[line[k] for k in ['product_id', 'quantity', 'unit_price_cents', 'sku', 'product_name', 'currency', 'publication_version', 'warehouse_id']]))
            conn.execute('INSERT INTO orders.checkout_requests(user_id,idempotency_key,request_hash,order_id) VALUES(%s,%s,%s,%s)', (user['user_id'], idempotency_key, request_hash, oid))
            plan = conn.execute('SELECT * FROM orders.test_plans WHERE user_id=%s AND idempotency_key=%s', (user['user_id'], idempotency_key)).fetchone()
            conn.execute('''INSERT INTO orders.sagas(order_id,step,correlation_id,simulation,fault,reservation_ttl)
                VALUES(%s,'RESERVE',%s,%s,%s,%s)''', (oid, correlation(), plan['simulation'] if plan else 'success', plan['fault'] if plan else None, plan['reservation_ttl'] if plan else 900))
    # Crash scenarios are intentionally executed by the separate worker, never by the API process.
    result = read_order(oid, user, True)
    if not result['saga']['fault'] or not result['saga']['fault'].startswith('crash_'):
        from market_commerce.saga import drive
        drive(oid)
    result = read_order(oid, user)
    if not result['complete']:
        response.status_code = 202
    return result


@app.get('/api/orders')
def list_orders(page: int = 1, page_size: int = 20, all_customers: bool = False, user=USER):
    if not 1 <= page_size <= 100 or not 1 <= page <= 10000:
        fail(422, 'INVALID_PAGE', 'Invalid pagination')
    if all_customers:
        require_staff(user)
    with transaction('orders') as conn:
        where = 'true' if all_customers else 'auth_user_id=%s'
        args = () if all_customers else (user['user_id'],)
        total = conn.execute(f'SELECT count(*) AS n FROM orders.orders WHERE {where}', args).fetchone()['n']
        rows = conn.execute(f'SELECT * FROM orders.orders WHERE {where} ORDER BY order_id DESC LIMIT %s OFFSET %s', (*args, page_size, (page-1)*page_size)).fetchall()
        return {'items': rows, 'total': total, 'page': page, 'page_size': page_size}


@app.get('/api/orders/{order_id}')
def get_order(order_id: int, user=USER):
    return read_order(order_id, user)


@app.get('/api/orders/{order_id}/status')
def get_status(order_id: int, user=USER):
    result = read_order(order_id, user)
    return {k: result[k] for k in ['order_id', 'status', 'complete', 'saga']}


@app.post('/api/orders/{order_id}/cancel')
def cancel(order_id: int, response: Response, user=USER):
    read_order(order_id, user)
    with transaction('orders') as conn:
        saga = conn.execute('SELECT * FROM orders.sagas WHERE order_id=%s FOR UPDATE', (order_id,)).fetchone()
        order = conn.execute('SELECT status FROM orders.orders WHERE order_id=%s FOR UPDATE', (order_id,)).fetchone()
        if order['status'] == 'CANCELLED':
            pass
        elif not saga or saga['step'] in ('FINALIZE', 'DONE') or order['status'] not in ('PENDING', 'STOCK_RESERVED'):
            fail(409, 'CANCELLATION_NOT_ALLOWED', 'Finalized orders require an authorized refund')
        else:
            conn.execute('UPDATE orders.sagas SET cancel_requested=true,next_attempt_at=now() WHERE order_id=%s', (order_id,))
    from market_commerce.saga import drive
    drive(order_id)
    result = read_order(order_id, user)
    response.status_code = 200 if result['complete'] else 202
    return result


@app.get('/internal/orders/{order_id}', dependencies=[Depends(internal('orders', ('inventory', 'payments')))])
def internal_order(order_id: int):
    return read_order(order_id, internal_view=True)


@app.post('/internal/orders/{order_id}/resume', dependencies=[Depends(internal('orders', ('payments',)))])
def internal_resume(order_id: int):
    from market_commerce.saga import drive
    drive(order_id)
    return read_order(order_id)


@app.post('/internal/orders/{order_id}/expire', dependencies=[Depends(internal('orders', ('inventory',)))])
def expire_context(order_id: int):
    with transaction('orders') as conn:
        saga = conn.execute('SELECT * FROM orders.sagas WHERE order_id=%s FOR UPDATE', (order_id,)).fetchone()
        if saga is None:
            return {'safe_to_release': False}  # Historical fixture reservations have no expiry.
        if saga['step'] == 'RESERVE':
            # This persisted decision fences any concurrent RESERVE -> PAY advancement.
            conn.execute("UPDATE orders.sagas SET step='RELEASE',cancel_requested=true,failure_code='RESERVATION_EXPIRED',next_attempt_at=now() WHERE order_id=%s", (order_id,))
            return {'safe_to_release': True}
        return {'safe_to_release': saga['step'] in ('RELEASE', 'REFUND_RELEASE', 'DONE')}


@app.post('/internal/orders/{order_id}/refund-status', dependencies=[Depends(internal('orders', ('payments',)))])
def refund_status(order_id: int):
    payment = remote('orders', 'payments', 'GET', f'/internal/payments/order/{order_id}')['payment']
    if payment and payment['status'] == 'REFUNDED':
        with transaction('orders', f'order:{order_id}:refund') as conn:
            conn.execute("UPDATE orders.orders SET status='REFUNDED' WHERE order_id=%s AND status IN ('PAID','SHIPPED','DELIVERED','STOCK_RESERVED')", (order_id,))
    return {'status': 'reconciled'}
