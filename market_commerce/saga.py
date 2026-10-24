"""Persisted checkout orchestrator. No SQL transaction spans an HTTP call."""
import argparse
import logging
import os
import time
from datetime import timedelta
from uuid import uuid4

from market_commerce.common import (
    CORRELATION,
    RemoteError,
    env,
    now,
    remote,
    transaction,
)
from market_commerce.orders import read_order

LOG = logging.getLogger('checkout-saga')


def claim(order_id=None):
    owner = uuid4()
    with transaction('orders') as conn:
        row = conn.execute('''SELECT * FROM orders.sagas WHERE step<>'DONE' AND next_attempt_at<=now()
            AND (lease_until IS NULL OR lease_until<now()) AND (%s::bigint IS NULL OR order_id=%s)
            ORDER BY next_attempt_at,order_id FOR UPDATE SKIP LOCKED LIMIT 1''', (order_id, order_id)).fetchone()
        if row is None:
            return None
        claimed = conn.execute('''UPDATE orders.sagas SET lease_owner=%s,lease_until=now()+interval '20 seconds',
            updated_at=now() WHERE order_id=%s RETURNING *''', (owner, row['order_id'])).fetchone()
        conn.execute('INSERT INTO orders.saga_attempts(attempt_id,order_id,step) VALUES(%s,%s,%s)', (owner, row['order_id'], row['step']))
        return claimed


def advance(job, step, status=None, payment_id=None, failure=None):
    with transaction('orders', f"saga:{job['order_id']}:{job['step']}") as conn:
        current = conn.execute('''SELECT * FROM orders.sagas WHERE order_id=%s AND lease_owner=%s AND step=%s FOR UPDATE''',
            (job['order_id'], job['lease_owner'], job['step'])).fetchone()
        if current is None:
            return
        if step == 'PAY' and current['cancel_requested']:
            step = 'RELEASE'
        if step == 'FINALIZE' and current['cancel_requested']:
            step = 'REFUND'
        if status:
            if step == 'DONE' and job['step'] == 'RELEASE' and current['cancel_requested']:
                status = 'CANCELLED'
            conn.execute('UPDATE orders.orders SET status=%s WHERE order_id=%s', (status, job['order_id']))
        conn.execute('''UPDATE orders.sagas SET step=%s,payment_id=coalesce(%s,payment_id),failure_code=coalesce(%s,failure_code),
            attempts=0,next_attempt_at=now(),updated_at=now() WHERE order_id=%s''', (step, payment_id, failure, job['order_id']))
        conn.execute("UPDATE orders.saga_attempts SET outcome=%s,completed_at=now() WHERE attempt_id=%s", ('ADVANCED:' + step, job['lease_owner']))


def retry(job, code):
    delay = min(60, 2 ** min(job['attempts'] + 1, 6))
    with transaction('orders') as conn:
        conn.execute("UPDATE orders.saga_attempts SET outcome=%s,completed_at=now() WHERE attempt_id=%s", ('RETRY:' + code, job['lease_owner']))
        conn.execute('''UPDATE orders.sagas SET attempts=attempts+1,failure_code=%s,next_attempt_at=%s,updated_at=now()
            WHERE order_id=%s AND lease_owner=%s AND step=%s''',
            (code, now() + timedelta(seconds=delay), job['order_id'], job['lease_owner'], job['step']))
    LOG.warning('Saga retry order_id=%s step=%s code=%s', job['order_id'], job['step'], code)


def fault(job, name):
    if job['fault'] != name or job['fault_consumed'] or env().get('COMMERCE_TESTING') != '1':
        return False
    with transaction('orders') as conn:
        row = conn.execute('''UPDATE orders.sagas SET fault_consumed=true WHERE order_id=%s AND lease_owner=%s
            AND step=%s AND NOT fault_consumed RETURNING order_id''', (job['order_id'], job['lease_owner'], job['step'])).fetchone()
    if row and name.startswith('crash_'):
        if os.environ.get('COMMERCE_PROCESS') != 'worker':
            raise RuntimeError('Crash injection is worker-only')
        os._exit(73)
    return row is not None


def pause(job):
    if job['fault'] != 'pause_after_reserve' or job['fault_consumed']:
        return False
    with transaction('orders') as conn:
        row = conn.execute('''UPDATE orders.sagas SET next_attempt_at=now()+interval '1 hour'
            WHERE order_id=%s AND step=%s AND lease_owner=%s AND NOT cancel_requested AND NOT fault_consumed
            RETURNING order_id''', (job['order_id'], job['step'], job['lease_owner'])).fetchone()
    return row is not None


def step(job):
    order = read_order(job['order_id'], internal_view=True)
    oid = job['order_id']
    stage = job['step']
    if stage == 'RESERVE':
        if order['saga']['cancel_requested']:
            advance(job, 'RELEASE')
            return
        remote('orders', 'inventory', 'POST', '/internal/reservations', {
            'order_id': oid, 'ttl_seconds': job['reservation_ttl'],
            'items': [{k: line[k] for k in ['product_id', 'warehouse_id', 'quantity']} for line in order['items']]})
        if pause(job):
            return
        fault(job, 'crash_after_reserve')
        advance(job, 'PAY', 'STOCK_RESERVED')
    elif stage == 'PAY':
        payment = remote('orders', 'payments', 'GET', f'/internal/payments/order/{oid}')['payment']
        if payment is None and order['saga']['cancel_requested']:
            advance(job, 'RELEASE')
            return
        if payment is None or payment['status'] == 'PENDING':
            payment = remote('orders', 'payments', 'POST', '/internal/payments',
                {'order_id': oid, 'amount_cents': order['total_cents'], 'simulation': job['simulation']})
        fault(job, 'crash_after_payment')
        if payment['status'] == 'SUCCEEDED':
            advance(job, 'FINALIZE', payment_id=payment['payment_id'])
        elif payment['status'] == 'REFUNDED':
            advance(job, 'REFUND_RELEASE', payment_id=payment['payment_id'])
        elif payment['status'] == 'FAILED':
            advance(job, 'RELEASE', payment_id=payment['payment_id'], failure='PAYMENT_DECLINED')
        else:
            retry(job, 'PAYMENT_PENDING')
    elif stage == 'FINALIZE':
        if fault(job, 'finalize_fail_once'):
            raise RemoteError(503, 'INJECTED_FINALIZATION_OUTAGE')
        if fault(job, 'finalize_permanent'):
            raise RemoteError(409, 'INJECTED_FINALIZATION_REJECTION')
        remote('orders', 'inventory', 'POST', f'/internal/reservations/order/{oid}/confirm')
        fault(job, 'crash_after_finalize')
        advance(job, 'DONE', 'PAID')
    elif stage == 'RELEASE':
        if fault(job, 'compensation_fail_once'):
            raise RemoteError(503, 'INJECTED_COMPENSATION_OUTAGE')
        remote('orders', 'inventory', 'POST', f'/internal/reservations/order/{oid}/release')
        advance(job, 'DONE', 'PAYMENT_FAILED')
    elif stage == 'REFUND':
        payment = remote('orders', 'payments', 'GET', f'/internal/payments/order/{oid}')['payment']
        if not payment or payment['status'] not in ('SUCCEEDED', 'REFUNDED'):
            retry(job, 'REFUND_RECONCILIATION_PENDING')
            return
        if payment['status'] != 'REFUNDED':
            remote('orders', 'payments', 'POST', f"/internal/payments/{payment['payment_id']}/refund",
                {'amount_cents': order['total_cents'], 'idempotency_key': f'saga-refund:{oid}'})
        advance(job, 'REFUND_RELEASE')
    elif stage == 'REFUND_RELEASE':
        remote('orders', 'inventory', 'POST', f'/internal/reservations/order/{oid}/release')
        advance(job, 'DONE', 'REFUNDED')


def drive(order_id=None, limit=8):
    for _ in range(limit):
        job = claim(order_id)
        if job is None:
            return
        token = CORRELATION.set(str(job['correlation_id']))
        try:
            from opentelemetry import trace
            from opentelemetry.propagate import extract

            from market_commerce.telemetry import PROVIDERS
            provider = PROVIDERS.get('orders')
            tracer = provider.get_tracer('checkout-saga') if provider else trace.get_tracer('checkout-saga')
            with tracer.start_as_current_span('checkout.' + job['step'].lower(),
                    context=extract({'traceparent': job.get('traceparent') or ''})):
                step(job)
        except RemoteError as exc:
            if job['step'] == 'RESERVE' and exc.status in (400, 404, 409, 422):
                advance(job, 'RELEASE', failure='INVENTORY_REJECTED')
            elif job['step'] == 'FINALIZE' and exc.status in (400, 404, 409, 422):
                advance(job, 'REFUND', failure='FINALIZATION_REJECTED')
            else:
                retry(job, exc.code)
        except Exception as exc:  # noqa: BLE001 -- persisted orchestration boundary
            retry(job, type(exc).__name__)
        finally:
            with transaction('orders') as conn:
                conn.execute('UPDATE orders.sagas SET lease_owner=NULL,lease_until=NULL WHERE order_id=%s AND lease_owner=%s', (job['order_id'], job['lease_owner']))
            CORRELATION.reset(token)


def main():
    os.environ['COMMERCE_PROCESS'] = 'worker'
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--order-id', type=int)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    iteration = 0
    while True:
        try:
            drive(args.order_id, 20)
            if args.once:
                return
            if iteration % 5 == 0:
                for target, path in [('inventory', '/internal/expire'), ('payments', '/internal/reconcile-refunds')]:
                    try:
                        remote('orders', target, 'POST', path)
                    except RemoteError:
                        LOG.warning('Maintenance temporarily unavailable: %s', target)
            with transaction('orders') as conn:
                # Dedicated own-schema heartbeat avoids cross-service monitoring reads.
                conn.execute("SELECT set_config('application_name','market-saga',true)")
            PathHeartbeat.write()
        except Exception as exc:  # noqa: BLE001 -- process recovery loop
            LOG.error('Saga cycle failed: %s', type(exc).__name__)
            if args.once:
                raise SystemExit(1) from None
        iteration += 1
        time.sleep(1)


class PathHeartbeat:
    @staticmethod
    def write():
        from pathlib import Path
        Path('/tmp/saga-heartbeat').write_text(str(time.time()))


if __name__ == '__main__':
    main()
