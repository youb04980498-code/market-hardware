"""Staff-only composition of PUBLIC service reads. No SQL/Mongo/Neo4j access."""
import asyncio
import json
import threading
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import httpx
from fastapi import Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from market_commerce.common import BEARER, create_app, env, fail, require_staff
from market_world.events import EventBus, consume

bus = EventBus()


async def read(service, path, token, *, body=None):
    config = env()
    base = config.get(service.upper() + '_URL', 'http://127.0.0.1:8080')
    async with httpx.AsyncClient(timeout=8, trust_env=False) as client:
        response = await client.request('POST' if body else 'GET', base + path,
            headers={'Authorization': 'Bearer ' + token}, json=body)
        response.raise_for_status()
        result = response.json()
        if result.get('errors'):
            raise ValueError('Catalogue read failed')
        return result


async def authorize(token):
    try:
        user = await read('auth', '/api/auth/me', token)
    except httpx.HTTPStatusError as exc:
        fail(401 if exc.response.status_code in (401,403) else 503, 'AUTH_UNAVAILABLE', 'Active staff session required')
    except (httpx.HTTPError, ValueError):
        fail(503, 'AUTH_UNAVAILABLE', 'Authentication service unavailable')
    require_staff(user)


async def staff(credentials=BEARER):
    if not credentials:
        fail(401, 'UNAUTHENTICATED', 'Authentication required')
    await authorize(credentials.credentials)
    return credentials.credentials


STAFF = Depends(staff)


def run_consumer(stop):
    while not stop.is_set():
        try:
            consume(bus, stop, env())
        except Exception as exc:  # noqa: BLE001 -- worker retry boundary; no driver credentials/payload logging
            with bus.lock:
                bus.connected = False
                bus.worker_error = type(exc).__name__
            stop.wait(3)


@asynccontextmanager
async def lifecycle(app):
    stop = threading.Event()
    thread = None
    if env().get('WORLD_KAFKA_ENABLED', '1') == '1':
        if not env().get('WORLD_KAFKA_GROUP', 'market-3d-world-v1').startswith('market-3d-'):
            raise ValueError('Dedicated market-3d-* group required')
        thread = threading.Thread(target=run_consumer, args=(stop,), daemon=True)
        thread.start()
    yield
    stop.set()
    if thread:
        await asyncio.to_thread(thread.join, 12)


app = create_app('world')
app.router.routes = [r for r in app.router.routes if getattr(r, 'path', '') not in ('/health', '/api/world/health')]
app.router.lifespan_context = lifecycle


@app.get('/health')
@app.get('/api/world/health')
def health():
    return {'status': 'ok', 'stream': bus.status(), 'authority': 'HTTP service reads; Kafka invalidations only'}


async def optional(service, path, token, body=None):
    try:
        return {'available': True, 'observed_at': datetime.now(UTC).isoformat(), 'data': await read(service, path, token, body=body)}
    except (httpx.HTTPError, ValueError, KeyError):
        return {'available': False, 'data': None, 'error': service.upper() + '_UNAVAILABLE'}


@app.get('/api/world/snapshot')
async def snapshot(token=STAFF):
    # Bounded recent-order window; totals are separate from the visible subset.
    warehouses, orders, catalog, analytics = await asyncio.gather(
        optional('inventory', '/api/inventory/warehouses?include_test=true', token),
        optional('orders', '/api/orders?all_customers=true&page_size=100', token),
        optional('catalog', '/graphql', token, {'query': '{ products(page:1,pageSize:100){ total items{productId sku name category active} } }'}),
        optional('analytics', '/api/analytics/overview?start=2000-01-01&end=2100-01-01', token))
    if orders['available']:
        original = orders['data']
        orders['data'] = {'items': [{k: o.get(k) for k in ('order_id','status','total_cents','currency','created_at')} for o in original['items']],
                          'total': original['total'], 'truncated': original['total'] > len(original['items'])}
    payments = {'available': False, 'data': None, 'error': 'ORDER_WINDOW_UNAVAILABLE'}
    if orders['available']:
        ids = ','.join(str(o['order_id']) for o in orders['data']['items'])
        payments = await optional('payments', '/api/payments/states?order_ids=' + ids, token) if ids else {'available': True, 'data': {'items': [], 'provider': 'SIMULATED'}}
    return {'mode': 'LIVE', 'observed_at': datetime.now(UTC).isoformat(), 'stream': bus.status(),
            'warehouses': warehouses, 'orders': orders, 'catalog': catalog, 'analytics': analytics, 'payments': payments,
            'cart_telemetry': {'available': False, 'reason': 'No server-side cart/session telemetry is exposed'},
            'placements': 'SYNTHETIC', 'physical_tracking': False}


@app.get('/api/world/warehouses/{warehouse_id}/stock')
async def stock(warehouse_id: int, page: int = Query(1, ge=1, le=10000), token=STAFF):
    if warehouse_id < 1:
        fail(422, 'INVALID_WAREHOUSE', 'Positive warehouse ID required')
    result = await optional('inventory', f'/api/inventory/warehouses/{warehouse_id}/stock?page={page}&page_size=100', token)
    if not result['available']:
        fail(503, 'INVENTORY_UNAVAILABLE', 'Stock read unavailable')
    return result


@app.get('/api/world/orders/{order_id}')
async def order(order_id: int, token=STAFF):
    try:
        row = await read('orders', f'/api/orders/{order_id}', token)
    except httpx.HTTPStatusError as exc:
        fail(404 if exc.response.status_code == 404 else 503, 'ORDER_UNAVAILABLE', 'Order unavailable')
    except httpx.HTTPError:
        fail(503, 'ORDER_UNAVAILABLE', 'Order unavailable')
    result = {k: row.get(k) for k in ('order_id','status','total_cents','currency','created_at','complete')}
    result['items'] = [{k: line.get(k) for k in ('product_id','product_name','sku','quantity','unit_price_cents','warehouse_id')} for line in row['items']]
    result['payments'] = await optional('payments', f'/api/payments/states?order_ids={order_id}', token)
    return result


@app.get('/api/world/monitoring')
async def monitoring(token=STAFF):
    """Independent optional read: unavailable monitoring never blocks core snapshots."""
    return await optional('analytics', '/api/analytics/observability', token)


@app.get('/api/world/events', response_class=StreamingResponse,
         responses={200: {'content': {'text/event-stream': {'schema': {'type': 'string'}}}}},
         description='Bearer-authenticated invalidations. Every connection requires a full API resync; no business payload replay.')
async def events(request: Request, token=STAFF):
    async def stream():
        revision = None
        # Every new/reconnected stream mandates a new API snapshot; no replay/state assumptions.
        yield 'event: resync\ndata: ' + json.dumps(bus.status()) + '\n\n'
        for tick in range(60):
            if await request.is_disconnected():
                return
            if tick % 10 == 0:
                try:
                    await authorize(token)  # recheck revocation and expiry at most every 10 seconds
                except HTTPException:
                    yield 'event: auth-required\ndata: {}\n\n'
                    return
            status = bus.status()
            event_type = 'invalidate' if status['revision'] != revision else 'heartbeat'
            revision = status['revision']
            if event_type == 'invalidate' or tick % 10 == 0:
                yield f"id: {status['instance']}:{revision}\nevent: {event_type}\ndata: {json.dumps(status)}\n\n"
            await asyncio.sleep(1)
    return StreamingResponse(stream(), media_type='text/event-stream', headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})
