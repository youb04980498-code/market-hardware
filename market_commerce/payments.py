from typing import Literal

from fastapi import Depends, Header, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from market_commerce.common import (
    RemoteError,
    authenticated,
    create_app,
    env,
    event,
    fail,
    fingerprint,
    internal,
    remote,
    require_staff,
    transaction,
)

app = create_app('payments')
user_dependency = authenticated('payments')
USER = Depends(user_dependency)
REQUEST_KEY = Header(min_length=8, max_length=128)
trusted = [Depends(internal('payments'))]
SIMULATION = Literal['success', 'decline', 'timeout_once', 'timeout_succeeded', 'refund_fail_once']


class Pay(BaseModel):
    model_config = ConfigDict(extra='forbid')
    order_id: int = Field(gt=0, strict=True)
    amount_cents: int | None = Field(default=None, ge=0, strict=True)


class InternalPay(Pay):
    simulation: SIMULATION = 'success'


class Refund(BaseModel):
    model_config = ConfigDict(extra='forbid')
    amount_cents: int = Field(gt=0, strict=True)


def public_payment(row):
    return {k: row[k] for k in ['payment_id', 'order_id', 'amount_cents', 'currency', 'status', 'method', 'created_at', 'attempts']}


def get_by_order(order_id):
    with transaction('payments') as conn:
        return conn.execute('SELECT * FROM payments.payments WHERE order_id=%s AND owner_user_id IS NOT NULL', (order_id,)).fetchone()


def charge(body):
    context = remote('payments', 'orders', 'GET', f'/internal/orders/{body.order_id}')
    if body.amount_cents is not None and body.amount_cents != context['total_cents']:
        fail(409, 'AMOUNT_MISMATCH', 'Payment amount must match the server-calculated order total')
    if body.simulation != 'success' and env().get('COMMERCE_TESTING') != '1':
        fail(403, 'TESTING_DISABLED', 'Payment simulation controls are disabled')
    timeout = False
    key = f'checkout:{body.order_id}'
    with transaction('payments', key) as conn:
        conn.execute('SELECT pg_advisory_xact_lock(%s)', (body.order_id,))
        payment = conn.execute('SELECT * FROM payments.payments WHERE order_id=%s AND owner_user_id IS NOT NULL FOR UPDATE', (body.order_id,)).fetchone()
        if payment is None:
            if context['status'] != 'STOCK_RESERVED' or context['saga']['step'] != 'PAY':
                fail(409, 'ORDER_NOT_PAYABLE', 'Checkout is not ready for payment')
            payment = conn.execute('''INSERT INTO payments.payments(order_id,amount_cents,currency,owner_user_id,simulation,
                status,method,idempotency_key) VALUES(%s,%s,%s,%s,%s,'PENDING','SIMULATED_CARD',%s) RETURNING *''',
                (body.order_id, context['total_cents'], context['currency'], context['auth_user_id'], body.simulation, key)).fetchone()
        if payment['amount_cents'] != context['total_cents'] or payment['currency'] != context['currency']:
            fail(409, 'AMOUNT_MISMATCH', 'Stored payment does not match the order')
        if payment['status'] != 'PENDING':
            return public_payment(payment)
        attempt = payment['attempts'] + 1
        scenario = payment['simulation']
        timeout = attempt == 1 and scenario in ('timeout_once', 'timeout_succeeded')
        status = 'FAILED' if scenario == 'decline' else 'PENDING' if scenario == 'timeout_once' and attempt == 1 else 'SUCCEEDED'
        payment = conn.execute('UPDATE payments.payments SET status=%s,attempts=%s WHERE payment_id=%s RETURNING *', (status, attempt, payment['payment_id'])).fetchone()
        conn.execute('INSERT INTO payments.payment_attempts(payment_id,attempt,outcome) VALUES(%s,%s,%s)',
            (payment['payment_id'], attempt, 'TIMEOUT_AFTER_CAPTURE' if scenario == 'timeout_succeeded' and timeout else 'TIMEOUT' if timeout else status))
        if status == 'SUCCEEDED':
            conn.execute('''INSERT INTO payments.financial_audit(payment_id,operation,amount_cents,reference)
                VALUES(%s,'CAPTURE',%s,%s) ON CONFLICT(operation,reference) DO NOTHING''',
                (payment['payment_id'], payment['amount_cents'], key))
    if timeout:
        fail(504, 'PROVIDER_TIMEOUT', 'Provider result is uncertain; reconcile using the same payment identity')
    return public_payment(payment)


def notify_refund(payment_id):
    with transaction('payments') as conn:
        payment = conn.execute('SELECT * FROM payments.payments WHERE payment_id=%s', (payment_id,)).fetchone()
    remote('payments', 'orders', 'POST', f"/internal/orders/{payment['order_id']}/refund-status")
    with transaction('payments') as conn:
        conn.execute("UPDATE payments.refunds SET notify_pending=false WHERE payment_id=%s AND status='SUCCEEDED'", (payment_id,))


def refund_payment(payment_id, amount, key, saga_compensation=False):
    context_payment = None
    with transaction('payments') as conn:
        context_payment = conn.execute('SELECT * FROM payments.payments WHERE payment_id=%s', (payment_id,)).fetchone()
    if context_payment is None:
        fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found')
    context = remote('payments', 'orders', 'GET', f"/internal/orders/{context_payment['order_id']}")
    if context['auth_user_id'] != context_payment['owner_user_id']:
        fail(409, 'ORDER_MISMATCH', 'Payment ownership does not match the order')
    if not saga_compensation and not context['complete']:
        fail(409, 'CHECKOUT_IN_PROGRESS', 'A checkout in progress owns its financial compensation')
    request_hash = fingerprint({'payment_id': payment_id, 'amount_cents': amount})
    failed = False
    with transaction('payments', key) as conn:
        payment = conn.execute('SELECT * FROM payments.payments WHERE payment_id=%s FOR UPDATE', (payment_id,)).fetchone()
        existing = conn.execute('SELECT * FROM payments.refunds WHERE payment_id=%s AND idempotency_key=%s FOR UPDATE', (payment_id, key)).fetchone()
        if existing and existing['request_hash'] != request_hash:
            fail(409, 'IDEMPOTENCY_CONFLICT', 'Refund key identifies a different request')
        if existing and existing['status'] == 'SUCCEEDED':
            result = existing
        else:
            if payment['status'] != 'SUCCEEDED':
                fail(409, 'NOT_REFUNDABLE', 'Payment is not refundable')
            if existing:
                result = conn.execute("UPDATE payments.refunds SET status='PENDING',attempts=attempts+1 WHERE refund_id=%s RETURNING *", (existing['refund_id'],)).fetchone()
            else:
                result = conn.execute('''INSERT INTO payments.refunds(payment_id,idempotency_key,amount_cents,request_hash,status,attempts)
                    VALUES(%s,%s,%s,%s,'PENDING',1) RETURNING *''', (payment_id, key, amount, request_hash)).fetchone()
            failed = payment['simulation'] == 'refund_fail_once' and result['attempts'] == 1
            result = conn.execute('UPDATE payments.refunds SET status=%s,notify_pending=%s WHERE refund_id=%s RETURNING *',
                ('FAILED' if failed else 'SUCCEEDED', not failed, result['refund_id'])).fetchone()
            if not failed:
                conn.execute('''INSERT INTO payments.financial_audit(payment_id,operation,amount_cents,reference)
                    VALUES(%s,'REFUND',%s,%s)''', (payment_id, amount, str(result['refund_id'])))
                refunded = conn.execute("SELECT coalesce(sum(amount_cents),0) AS amount FROM payments.refunds WHERE payment_id=%s AND status='SUCCEEDED'", (payment_id,)).fetchone()['amount']
                if refunded == payment['amount_cents']:
                    conn.execute("UPDATE payments.payments SET status='REFUNDED' WHERE payment_id=%s", (payment_id,))
                event(conn, 'payments', 'payment.refund_succeeded', 'payment', payment_id,
                    {'payment_id': payment_id, 'order_id': payment['order_id'], 'refund_id': result['refund_id'], 'amount_cents': amount}, key)
            else:
                event(conn, 'payments', 'payment.refund_failed', 'payment', payment_id,
                    {'payment_id': payment_id, 'refund_id': result['refund_id']}, key)
    if failed:
        fail(503, 'REFUND_PROVIDER_UNAVAILABLE', 'Refund failed; retry the same idempotent request')
    try:
        notify_refund(payment_id)
    except RemoteError:
        pass  # notify_pending is durable and reconciled by the maintenance cycle.
    return {k: result[k] for k in ['refund_id', 'payment_id', 'amount_cents', 'status', 'attempts']}


@app.post('/api/payments')
def public_pay(body: Pay, request: Request, response: Response, user=USER):
    token = request.headers['Authorization'][7:]
    context = remote('payments', 'orders', 'GET', f'/api/orders/{body.order_id}', bearer=token)
    if body.amount_cents is not None and body.amount_cents != context['total_cents']:
        fail(409, 'AMOUNT_MISMATCH', 'Payment amount must match the order total')
    # Public retries always re-enter the durable checkout; they cannot bypass reservations.
    remote('payments', 'orders', 'POST', f'/internal/orders/{body.order_id}/resume')
    result = get_by_order(body.order_id)
    if result is None:
        response.status_code = 202
        return {'order_id': body.order_id, 'status': 'PENDING_CHECKOUT'}
    return public_payment(result)


@app.get('/api/payments/{payment_id}')
def get_payment(payment_id: int, user=USER):
    with transaction('payments') as conn:
        row = conn.execute('SELECT * FROM payments.payments WHERE payment_id=%s', (payment_id,)).fetchone()
    if row is None:
        fail(404, 'PAYMENT_NOT_FOUND', 'Payment not found')
    if row['owner_user_id'] != user['user_id']:
        require_staff(user)
    return public_payment(row)


@app.post('/api/payments/{payment_id}/refund')
def public_refund(payment_id: int, body: Refund, idempotency_key: str = REQUEST_KEY, user=USER):
    require_staff(user)
    return refund_payment(payment_id, body.amount_cents, idempotency_key)


@app.post('/internal/payments', dependencies=trusted)
def internal_charge(body: InternalPay):
    return charge(body)


@app.get('/internal/payments/order/{order_id}', dependencies=trusted)
def internal_get(order_id: int):
    row = get_by_order(order_id)
    return {'payment': public_payment(row) if row else None}


class InternalRefund(Refund):
    idempotency_key: str = Field(min_length=8, max_length=128)


@app.post('/internal/payments/{payment_id}/refund', dependencies=trusted)
def internal_refund(payment_id: int, body: InternalRefund):
    return refund_payment(payment_id, body.amount_cents, body.idempotency_key, saga_compensation=True)


@app.post('/internal/reconcile-refunds', dependencies=trusted)
def reconcile_refunds():
    with transaction('payments') as conn:
        rows = conn.execute("SELECT DISTINCT payment_id FROM payments.refunds WHERE notify_pending AND status='SUCCEEDED' LIMIT 50").fetchall()
    count = 0
    for row in rows:
        notify_refund(row['payment_id'])
        count += 1
    return {'reconciled': count}
