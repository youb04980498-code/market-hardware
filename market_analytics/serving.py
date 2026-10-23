"""Bounded filtering and rollup over already materialized Gold records, not Spark/transactional SQL."""
from collections import defaultdict
from datetime import UTC, datetime

from market_analytics.config import connect, env


def current():
    with connect('api') as conn:
        release = conn.execute('''SELECT r.document,r.published_at FROM current_release c JOIN releases r USING(release_id)''').fetchone()
        pipeline = conn.execute('SELECT * FROM pipeline_status WHERE singleton').fetchone()
    if not release:
        raise LookupError('ANALYTICS_NOT_READY')
    doc = release['document']
    success = pipeline['last_success_at'] if pipeline else None
    age = (datetime.now(UTC) - success).total_seconds() if success else None
    return doc, {'release_id': doc['release_id'], 'snapshot_at': doc['snapshot_at'],
        'last_refresh_at': success, 'published_at': release['published_at'], 'freshness_seconds': age,
        'stale': age is None or age > int(env().get('ANALYTICS_STALE_SECONDS', '180')) or bool(pipeline['error_code'])
            or pipeline['state'] not in ('RUNNING', 'REFRESHING'),
        'pipeline_state': pipeline['state'] if pipeline else 'UNKNOWN', 'error_code': pipeline['error_code'] if pipeline else None,
        'currency': 'EUR', 'timezone': 'UTC', 'revenue_basis': doc['revenue_basis'],
        'classification_basis': doc['classification_basis']}


def in_period(date, start=None, end=None):
    return (not start or date >= start) and (not end or date < end)


def selected(document, table, start=None, end=None):
    return [r for r in document['tables'][table] if in_period(r['date'], start, end)]


def rollup(records, keys, amounts):
    result = {}
    for row in records:
        key = tuple(row[k] for k in keys)
        target = result.setdefault(key, {**{k: row[k] for k in keys}, **dict.fromkeys(amounts, 0)})
        for field in amounts:
            target[field] += row[field]
    return list(result.values())


def report_for_period(doc, start=None, end=None):
    revenue = selected(doc, 'revenue_daily', start, end)
    orders = selected(doc, 'orders_daily', start, end)
    products = selected(doc, 'product_performance', start, end)
    customers = selected(doc, 'customers_daily', start, end)
    active = selected(doc, 'customer_activity', start, end)
    purchasing = defaultdict(int)
    for row in active:
        purchasing[row['customer_key']] += row['captured_orders']
    gross = sum(r['gross_cents'] for r in revenue)
    captured = sum(purchasing.values())
    return {'order_count': sum(r['order_count'] for r in orders),
        'paid_order_count': sum(r['order_count'] for r in orders if r['status'] in ('PAID', 'SHIPPED', 'DELIVERED')),
        'cancelled_order_count': sum(r['order_count'] for r in orders if r['status'] == 'CANCELLED'),
        'pending_order_count': sum(r['order_count'] for r in orders if r['status'] in ('PENDING', 'STOCK_RESERVED')),
        'gross_cents': gross, 'refunded_cents': sum(r['refunded_cents'] for r in revenue),
        'net_cents': sum(r['net_cents'] for r in revenue),
        'aov_cents': (2 * gross + captured) // (2 * captured) if captured else 0,
        'captured_order_count': captured,
        'registered_customers': sum(r['registered_customers'] for r in customers),
        'purchasing_customers': len(purchasing), 'repeat_customers': sum(n > 1 for n in purchasing.values()),
        'units_sold': sum(r['units_sold'] for r in products),
        'products': sorted(rollup(products, ['product_id', 'name', 'category'], ['units_sold', 'gross_cents', 'refunded_cents', 'net_cents']),
            key=lambda r: (-r['units_sold'], r['product_id'])),
        'categories': rollup(products, ['category'], ['units_sold', 'gross_cents', 'refunded_cents', 'net_cents']),
        'orders_by_status': rollup(orders, ['status'], ['order_count']),
        'revenue_daily': sorted(revenue, key=lambda r: r['date']),
        'orders_daily': sorted(rollup(orders, ['date'], ['order_count']), key=lambda r: r['date']),
        'customers_daily': sorted(customers, key=lambda r: r['date'])}
