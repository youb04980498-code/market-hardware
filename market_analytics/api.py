from datetime import date, datetime
from typing import Annotated, Generic, Literal, TypeVar

import httpx
from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field

from market_analytics.config import connect, env
from market_analytics.model import quarter_bounds
from market_analytics.serving import current, report_for_period, rollup, selected
from market_commerce.common import (
    BEARER,
    create_app,
    decode_access,
    fail,
    require_staff,
)

app = create_app('analytics')
# Reuse public error/correlation conventions, but use the isolated serving connection for readiness.
app.router.routes = [r for r in app.router.routes if getattr(r, 'path', '') not in ('/health', '/api/analytics/health')]


def staff(request: Request, credentials=BEARER):
    if not credentials:
        fail(401, 'UNAUTHENTICATED', 'Authentication required')
    claims = decode_access(credentials.credentials)
    if claims.get('type') != 'access':
        fail(401, 'UNAUTHENTICATED', 'Access token required')
    try:
        result = httpx.get(env().get('AUTH_URL', 'http://127.0.0.1:8080') + '/api/auth/me',
            headers={'Authorization': 'Bearer ' + credentials.credentials}, timeout=5, trust_env=False)
    except httpx.HTTPError:
        fail(503, 'AUTH_UNAVAILABLE', 'Authentication service unavailable')
    if result.status_code in (401, 403):
        fail(401, 'UNAUTHENTICATED', 'Session expired or revoked')
    if result.status_code != 200:
        fail(503, 'AUTH_UNAVAILABLE', 'Authentication service unavailable')
    return require_staff(result.json())


STAFF = Depends(staff)


class Freshness(BaseModel):
    release_id: str
    snapshot_at: datetime
    last_refresh_at: datetime | None
    published_at: datetime
    freshness_seconds: float | None
    stale: bool
    pipeline_state: str
    error_code: str | None
    currency: Literal['EUR']
    timezone: Literal['UTC']
    revenue_basis: str
    classification_basis: str


class Overview(BaseModel):
    order_count: int
    paid_order_count: int
    cancelled_order_count: int
    pending_order_count: int
    gross_cents: int
    refunded_cents: int
    net_cents: int
    aov_cents: int
    captured_order_count: int
    registered_customers: int
    purchasing_customers: int
    repeat_customers: int
    units_sold: int


class Revenue(BaseModel):
    period: str
    gross_cents: int
    refunded_cents: int
    net_cents: int


Data = TypeVar('Data')


class AnalyticsResponse(BaseModel, Generic[Data]):
    data: Data
    metadata: Freshness
    definitions: dict[str, str] = Field(default_factory=dict)


class Period:
    def __init__(self, start: Annotated[date | None, Query(alias='from')] = None,
                 end: Annotated[date | None, Query(alias='to')] = None):
        if start and end and start >= end:
            fail(422, 'INVALID_DATE_RANGE', 'from must precede exclusive to')
        self.start = start.isoformat() if start else None
        self.end = end.isoformat() if end else None


PERIOD = Depends(Period)
DEFINITIONS = {
    'revenue': 'Captured payments only; payment-creation UTC cohorts with latest successful refunds. Historical REFUNDED without refund rows means full refund, occurrence date unknown.',
    'aov': 'Gross captured cents / distinct captured orders, rounded half up to integer cents; includes later-refunded orders.',
    'customers': 'Orders customer registry, including synthetic historical customers; not all Auth identities.',
    'products': 'Gross sold units, no inferred physical returns; frozen line prices. Current published category classification or UNKNOWN.',
    'freshness': 'Eventual consistency. Last refresh is a successful authoritative snapshot verification. Readiness is not financial reconciliation.',
}


def load():
    try:
        return current()
    except LookupError:
        fail(503, 'ANALYTICS_NOT_READY', 'No complete analytical release is published')


def response(data, meta):
    return {'data': data, 'metadata': meta, 'definitions': DEFINITIONS}


@app.get('/health')
@app.get('/api/analytics/health')
def health():
    _, meta = load()
    return {'status': 'degraded' if meta['stale'] else 'ok', 'service': 'analytics', 'release_id': meta['release_id']}


@app.get('/api/analytics/overview', response_model=AnalyticsResponse[Overview])
def overview(period=PERIOD, user=STAFF):
    doc, meta = load()
    report = report_for_period(doc, period.start, period.end)
    return response({k: v for k, v in report.items() if not isinstance(v, list)}, meta)


@app.get('/api/analytics/revenue', response_model=AnalyticsResponse[list[Revenue]])
def revenue(period=PERIOD, granularity: Literal['day', 'month', 'quarter'] = 'day', user=STAFF):
    doc, meta = load()
    daily = selected(doc, 'revenue_daily', period.start, period.end)
    for row in daily:
        day = date.fromisoformat(row['date'])
        row['period'] = row['date'] if granularity == 'day' else row['date'][:7] if granularity == 'month' else f'{day.year}-Q{(day.month-1)//3+1}'
    return response(sorted(rollup(daily, ['period'], ['gross_cents', 'refunded_cents', 'net_cents']), key=lambda r: r['period']), meta)


@app.get('/api/analytics/orders', response_model=AnalyticsResponse)
def orders(period=PERIOD, user=STAFF):
    doc, meta = load()
    report = report_for_period(doc, period.start, period.end)
    return response({'daily': report['orders_daily'], 'statuses': report['orders_by_status']}, meta)


@app.get('/api/analytics/products/top', response_model=AnalyticsResponse)
def products(period=PERIOD, category: str | None = None, page: int = Query(1, ge=1, le=10000),
             page_size: int = Query(20, ge=1, le=100), user=STAFF):
    if category and category not in ('CPU', 'MOTHERBOARD', 'RAM', 'GPU', 'SSD', 'PSU', 'CASE', 'COOLER', 'PERIPHERAL', 'UNKNOWN'):
        fail(422, 'INVALID_CATEGORY', 'Unknown product category')
    doc, meta = load()
    report = report_for_period(doc, period.start, period.end)
    data = [r for r in report['products'] if not category or r['category'] == category]
    return response({'items': data[(page-1)*page_size:page*page_size], 'total': len(data), 'page': page,
        'page_size': page_size, 'categories': report['categories']}, meta)


@app.get('/api/analytics/inventory', response_model=AnalyticsResponse)
def inventory(warehouse_id: int | None = Query(None, gt=0), threshold: int | None = Query(None, ge=0, le=100000),
              low_stock_only: bool = False, include_test: bool = False, page: int = Query(1, ge=1, le=10000),
              page_size: int = Query(20, ge=1, le=100), user=STAFF):
    doc, meta = load()
    limit = threshold if threshold is not None else int(env().get('ANALYTICS_LOW_STOCK_THRESHOLD', '5'))
    data = [r for r in doc['tables']['inventory_snapshot']
        if (include_test or doc.get('warehouse_classification', {}).get(str(r['warehouse_id']), 'OPERATIONAL') == 'OPERATIONAL')
        and (warehouse_id is None or r['warehouse_id'] == warehouse_id)
        and (not low_stock_only or r['available'] <= limit)]
    data.sort(key=lambda r: (r['available'], r['product_id'], r['warehouse_id']))
    return response({'items': data[(page-1)*page_size:page*page_size], 'total': len(data), 'page': page,
        'page_size': page_size, 'threshold': limit,
        'warehouses': sorted({(r['warehouse_id'], r['warehouse']) for r in doc['tables']['inventory_snapshot']
            if include_test or doc.get('warehouse_classification', {}).get(str(r['warehouse_id']), 'OPERATIONAL') == 'OPERATIONAL'})}, meta)


@app.get('/api/analytics/customers', response_model=AnalyticsResponse)
def customers(period=PERIOD, user=STAFF):
    doc, meta = load()
    report = report_for_period(doc, period.start, period.end)
    return response({k: report[k] for k in ('registered_customers', 'purchasing_customers', 'repeat_customers', 'customers_daily')}, meta)


@app.get('/api/analytics/quarters', response_model=AnalyticsResponse)
def quarters(user=STAFF):
    _, meta = load()
    with connect('api') as conn:
        result = conn.execute('SELECT DISTINCT ON(period) period,release_id,created_at,document FROM quarterly_reports ORDER BY period,created_at DESC').fetchall()
    return response(result, meta)


@app.get('/api/analytics/quarters/{year}/{quarter}', response_model=AnalyticsResponse)
def quarter(year: int, quarter: int, user=STAFF):
    try:
        quarter_bounds(year, quarter)
    except ValueError:
        fail(422, 'INVALID_QUARTER', 'Valid years 2000..2100 and quarters 1..4 are required')
    _, meta = load()
    with connect('api') as conn:
        result = conn.execute('SELECT document FROM quarterly_reports WHERE period=%s ORDER BY created_at DESC LIMIT 1', (f'{year}-Q{quarter}',)).fetchone()
    if not result:
        fail(404, 'QUARTER_NOT_MATERIALIZED', 'Run the quarterly batch script; HTTP does not execute Spark')
    return response(result['document'], meta)


@app.get('/api/analytics/pipeline/status', response_model=AnalyticsResponse)
def pipeline(user=STAFF):
    doc, meta = load()
    with connect('api') as conn:
        pipeline = conn.execute('SELECT * FROM pipeline_status WHERE singleton').fetchone()
    return response({'pipeline': pipeline, 'reconciliation': doc['reconciliation']}, meta)


from market_analytics.metrics import register as register_metrics
from market_analytics.operations import register as register_operations

register_operations(app, staff)
register_metrics()
