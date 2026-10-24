from datetime import timedelta
from uuid import UUID

from fastapi import Depends, Header, Query
from pydantic import BaseModel, ConfigDict, Field

from market_commerce.common import (
    authenticated,
    create_app,
    event,
    fail,
    fingerprint,
    internal,
    now,
    remote,
    require_staff,
    transaction,
)

app = create_app('inventory')
user_dependency = authenticated('inventory')
USER = Depends(user_dependency)
trusted = [Depends(internal('inventory'))]
UUID_KEY = Header()


class Line(BaseModel):
    model_config = ConfigDict(extra='forbid')
    product_id: int = Field(gt=0, strict=True)
    warehouse_id: int = Field(gt=0, strict=True)
    quantity: int = Field(gt=0, le=10000, strict=True)


class Reserve(BaseModel):
    model_config = ConfigDict(extra='forbid')
    order_id: int = Field(gt=0, strict=True)
    items: list[Line] = Field(min_length=1, max_length=50)
    ttl_seconds: int = Field(default=900, ge=1, le=86400)


class Warehouse(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    capacity_units: int = Field(ge=0, le=10000000, strict=True)
    classification: str = Field(default='OPERATIONAL', pattern='^(OPERATIONAL|TEST|ARCHIVED)$')


class Adjustment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    product_id: int = Field(gt=0, strict=True)
    warehouse_id: int = Field(gt=0, strict=True)
    delta: int = Field(ge=-100000, le=100000, strict=True)
    reason: str = Field(min_length=1, max_length=200)


class AvailabilityRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    items: list[Line] = Field(min_length=1, max_length=50)


@app.post('/internal/availability', dependencies=trusted)
def internal_availability(body: AvailabilityRequest):
    result = []
    with transaction('inventory') as conn:
        for item in body.items:
            row = conn.execute('SELECT quantity-reserved_quantity AS available FROM inventory.stock WHERE product_id=%s AND warehouse_id=%s',
                               (item.product_id, item.warehouse_id)).fetchone()
            available = row['available'] if row else 0
            result.append({'product_id': item.product_id, 'warehouse_id': item.warehouse_id,
                           'requested': item.quantity, 'available': available, 'sufficient': available >= item.quantity})
    return {'items': result}


def reserve(body):
    context = remote('inventory', 'orders', 'GET', f'/internal/orders/{body.order_id}')
    expected = {(i['product_id'], i['warehouse_id']): i['quantity'] for i in context['items']}
    actual = {(i.product_id, i.warehouse_id): i.quantity for i in body.items}
    if len(actual) != len(body.items) or expected != actual:
        fail(409, 'ORDER_MISMATCH', 'Reservation must match the authenticated checkout lines')
    result = []
    with transaction('inventory', f'order:{body.order_id}:reserve') as conn:
        conn.execute('SELECT pg_advisory_xact_lock(%s)', (body.order_id,))
        for wid in sorted({i.warehouse_id for i in body.items}):
            conn.execute('SELECT warehouse_id FROM inventory.warehouses WHERE warehouse_id=%s FOR UPDATE', (wid,))
        for line in sorted(body.items, key=lambda i: (i.warehouse_id, i.product_id)):
            existing = conn.execute('''SELECT * FROM inventory.reservations
                WHERE order_id=%s AND product_id=%s AND warehouse_id=%s''',
                (body.order_id, line.product_id, line.warehouse_id)).fetchone()
            if existing is None and context['status'] not in ('PENDING', 'STOCK_RESERVED'):
                fail(409, 'ORDER_TERMINAL', 'Order cannot acquire new reservations')
            row = conn.execute('SELECT * FROM inventory.create_reservation(%s,%s,%s,%s)',
                (body.order_id, line.product_id, line.warehouse_id, line.quantity)).fetchone()
            if row['status'] == 'RELEASED':
                fail(409, 'RESERVATION_EXPIRED', 'Reservation is no longer active')
            if row['expires_at'] is None and existing is None:
                row = conn.execute('UPDATE inventory.reservations SET expires_at=%s WHERE reservation_id=%s RETURNING *',
                    (now() + timedelta(seconds=body.ttl_seconds), row['reservation_id'])).fetchone()
            result.append(row)
    return {'reservations': result}


def transition(order_id, target, reservation_id=None):
    with transaction('inventory', f'order:{order_id}:{target}') as conn:
        conn.execute('SELECT pg_advisory_xact_lock(%s)', (order_id,))
        ids = conn.execute('SELECT DISTINCT warehouse_id FROM inventory.reservations WHERE order_id=%s ORDER BY warehouse_id', (order_id,)).fetchall()
        for row in ids:
            conn.execute('SELECT warehouse_id FROM inventory.warehouses WHERE warehouse_id=%s FOR UPDATE', (row['warehouse_id'],))
        rows = conn.execute('SELECT * FROM inventory.reservations WHERE order_id=%s ORDER BY reservation_id FOR UPDATE', (order_id,)).fetchall()
        selected = [r for r in rows if reservation_id is None or r['reservation_id'] == reservation_id]
        if target == 'COMMITTED' and (not selected or any(r['status'] == 'RELEASED' for r in selected)):
            fail(409, 'RESERVATION_NOT_ACTIVE', 'Cannot finalize a released or missing reservation')
        for row in selected:
            if row['status'] == 'ACTIVE':
                conn.execute('UPDATE inventory.reservations SET status=%s WHERE reservation_id=%s', (target, row['reservation_id']))
            elif row['status'] != target and reservation_id is not None:
                fail(409, 'RESERVATION_TERMINAL', 'Reservation is already finalized')
        return {'reservations': conn.execute('SELECT * FROM inventory.reservations WHERE order_id=%s ORDER BY reservation_id', (order_id,)).fetchall()}


def expire():
    with transaction('inventory') as conn:
        rows = conn.execute("SELECT * FROM inventory.reservations WHERE status='ACTIVE' AND expires_at<now() LIMIT 100").fetchall()
    released = 0
    for row in rows:
        decision = remote('inventory', 'orders', 'POST', f"/internal/orders/{row['order_id']}/expire")
        if decision['safe_to_release']:
            with transaction('inventory', f"reservation:{row['reservation_id']}:expire") as conn:
                conn.execute('SELECT warehouse_id FROM inventory.warehouses WHERE warehouse_id=%s FOR UPDATE', (row['warehouse_id'],))
                released += conn.execute("UPDATE inventory.reservations SET status='RELEASED' WHERE reservation_id=%s AND status='ACTIVE' AND expires_at<now()", (row['reservation_id'],)).rowcount
    return {'released': released}


@app.get('/api/inventory/availability/{product_id}')
@app.get('/api/inventory/products/{product_id}')
def availability(product_id: int, user=USER):
    if product_id < 1:
        fail(422, 'INVALID_PRODUCT', 'Product ID must be positive')
    with transaction('inventory') as conn:
        row = conn.execute('''SELECT coalesce(sum(quantity),0) AS quantity,coalesce(sum(reserved_quantity),0) AS reserved_quantity,
            coalesce(sum(quantity-reserved_quantity),0) AS available FROM inventory.stock WHERE product_id=%s''', (product_id,)).fetchone()
        return {'product_id': product_id, **row}


@app.get('/api/inventory/products/{product_id}/warehouses')
def warehouses(product_id: int, user=USER):
    with transaction('inventory') as conn:
        return {'items': conn.execute('''SELECT s.*,w.name,w.city,s.quantity-s.reserved_quantity AS available
            FROM inventory.stock s JOIN inventory.warehouses w USING(warehouse_id) WHERE product_id=%s ORDER BY warehouse_id''', (product_id,)).fetchall()}


@app.post('/api/inventory/warehouses', status_code=201)
def create_warehouse(body: Warehouse, user=USER):
    require_staff(user)
    with transaction('inventory') as conn:
        existing = conn.execute('SELECT * FROM inventory.warehouses WHERE name=%s', (body.name,)).fetchone()
        if existing:
            if any(existing[k] != v for k, v in body.model_dump().items()):
                fail(409, 'IDEMPOTENCY_CONFLICT', 'Warehouse name already identifies different values')
            return existing
        return conn.execute('INSERT INTO inventory.warehouses(name,city,capacity_units,classification) VALUES(%s,%s,%s,%s) RETURNING *',
                            (body.name, body.city, body.capacity_units, body.classification)).fetchone()


@app.post('/api/inventory/adjustments')
def adjust(body: Adjustment, idempotency_key: UUID = UUID_KEY, user=USER):
    require_staff(user)
    payload_hash = fingerprint(body.model_dump())
    with transaction('inventory', str(idempotency_key)) as conn:
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', (str(idempotency_key),))
        existing = conn.execute('SELECT * FROM inventory.adjustments WHERE adjustment_id=%s', (idempotency_key,)).fetchone()
        if existing:
            if existing['request_hash'] != payload_hash:
                fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key identifies another adjustment')
            return existing
        if not conn.execute('SELECT warehouse_id FROM inventory.warehouses WHERE warehouse_id=%s FOR UPDATE', (body.warehouse_id,)).fetchone():
            fail(404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found')
        conn.execute('''INSERT INTO inventory.stock(product_id,warehouse_id,quantity) VALUES(%s,%s,0)
            ON CONFLICT(product_id,warehouse_id) DO NOTHING''', (body.product_id, body.warehouse_id))
        conn.execute('UPDATE inventory.stock SET quantity=quantity+%s WHERE product_id=%s AND warehouse_id=%s',
                     (body.delta, body.product_id, body.warehouse_id))
        row = conn.execute('''INSERT INTO inventory.adjustments(adjustment_id,request_hash,product_id,warehouse_id,delta,reason)
            VALUES(%s,%s,%s,%s,%s,%s) RETURNING *''',
            (idempotency_key, payload_hash, body.product_id, body.warehouse_id, body.delta, body.reason)).fetchone()
        event(conn, 'inventory', 'inventory.stock_changed', 'product', body.product_id,
              {'product_id': body.product_id, 'warehouse_id': body.warehouse_id, 'delta': body.delta}, str(idempotency_key))
        return row


@app.post('/api/inventory/reservations')
def public_reserve(body: Reserve, user=USER):
    require_staff(user)
    return reserve(body)


@app.get('/api/inventory/reservations/{reservation_id}')
def get_reservation(reservation_id: int, user=USER):
    with transaction('inventory') as conn:
        row = conn.execute('SELECT * FROM inventory.reservations WHERE reservation_id=%s', (reservation_id,)).fetchone()
    if row is None:
        fail(404, 'NOT_FOUND', 'Reservation not found')
    # Inventory does not read Orders tables: ownership is checked through the Orders API.
    context = remote('inventory', 'orders', 'GET', f"/internal/orders/{row['order_id']}")
    if context['auth_user_id'] != user['user_id']:
        require_staff(user)
    return row


@app.post('/api/inventory/reservations/{reservation_id}/{action}')
def public_transition(reservation_id: int, action: str, user=USER):
    require_staff(user)
    if action not in ('confirm', 'release'):
        fail(404, 'NOT_FOUND', 'Operation not found')
    row = get_reservation(reservation_id, user)
    context = remote('inventory', 'orders', 'GET', f"/internal/orders/{row['order_id']}")
    allowed = context['status'] == 'PAID' if action == 'confirm' else context['status'] in ('CANCELLED', 'PAYMENT_FAILED', 'REFUNDED')
    if not allowed:
        fail(409, 'CHECKOUT_OWNS_RESERVATION', 'Active checkout reservations are controlled by the Saga')
    return transition(row['order_id'], 'COMMITTED' if action == 'confirm' else 'RELEASED', reservation_id)


@app.post('/api/inventory/expire')
def public_expire(user=USER):
    require_staff(user)
    return expire()


@app.post('/internal/reservations', dependencies=trusted)
def internal_reserve(body: Reserve):
    return reserve(body)


@app.get('/internal/reservations/order/{order_id}', dependencies=trusted)
def internal_reservations(order_id: int):
    with transaction('inventory') as conn:
        return {'reservations': conn.execute('SELECT * FROM inventory.reservations WHERE order_id=%s ORDER BY reservation_id', (order_id,)).fetchall()}


@app.post('/internal/reservations/order/{order_id}/{action}', dependencies=trusted)
def internal_transition(order_id: int, action: str):
    if action not in ('confirm', 'release'):
        fail(404, 'NOT_FOUND', 'Operation not found')
    return transition(order_id, 'COMMITTED' if action == 'confirm' else 'RELEASED')


@app.post('/internal/expire', dependencies=trusted)
def internal_expire():
    return expire()


@app.get('/api/inventory/warehouses')
def warehouse_summary(include_test: bool = False, user=USER):
    require_staff(user)
    with transaction('inventory') as conn:
        return {'items': conn.execute("""SELECT w.*,coalesce(sum(s.quantity),0) AS physical,
            coalesce(sum(s.reserved_quantity),0) AS reserved,
            coalesce(sum(s.quantity-s.reserved_quantity),0) AS available,
            count(*) FILTER(WHERE s.quantity-s.reserved_quantity<=5) AS low_stock_count,
            CASE WHEN w.capacity_units>0 THEN round(100.0*coalesce(sum(s.quantity),0)/w.capacity_units,2) END AS utilization_percent
            FROM inventory.warehouses w LEFT JOIN inventory.stock s USING(warehouse_id)
            WHERE (%s OR w.classification='OPERATIONAL') GROUP BY w.warehouse_id ORDER BY w.warehouse_id""", (include_test,)).fetchall(),
            'capacity_unit': 'physical_item'}


@app.get('/api/inventory/warehouses/{warehouse_id}/stock')
def warehouse_stock(warehouse_id: int, page: int = Query(1, ge=1, le=10000),
                    page_size: int = Query(100, ge=1, le=100), user=USER):
    """Schema-owned staff read; physical shelf locations are deliberately not invented."""
    require_staff(user)
    with transaction('inventory') as conn:
        if not conn.execute('SELECT 1 FROM inventory.warehouses WHERE warehouse_id=%s', (warehouse_id,)).fetchone():
            fail(404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found')
        total = conn.execute('SELECT count(*) AS n FROM inventory.stock WHERE warehouse_id=%s', (warehouse_id,)).fetchone()['n']
        rows = conn.execute('''SELECT product_id,warehouse_id,quantity,reserved_quantity,
            quantity-reserved_quantity AS available FROM inventory.stock WHERE warehouse_id=%s
            ORDER BY product_id LIMIT %s OFFSET %s''', (warehouse_id, page_size, (page-1)*page_size)).fetchall()
    return {'items': rows, 'total': total, 'page': page, 'page_size': page_size, 'placement': 'UNAVAILABLE'}
