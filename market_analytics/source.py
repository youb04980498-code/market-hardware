"""Explicit column lists are also the source reader's exact grant surface."""
import hashlib
import hmac
import json

import httpx

from market_analytics.config import connect, env

COLUMNS = {
    'orders': ('orders.orders', 'order_id,customer_id,status,total_cents,currency,created_at,updated_at'),
    'order_lines': ('orders.order_items', 'order_item_id,order_id,product_id,quantity,unit_price_cents,product_name,warehouse_id,publication_version'),
    'customers': ('orders.customers', 'customer_id,created_at'),
    'payments': ('payments.payments', 'payment_id,order_id,amount_cents,status,currency,created_at'),
    'refunds': ('payments.refunds', 'refund_id,payment_id,amount_cents,status,created_at'),
    'inventory': ('inventory.stock', 'product_id,warehouse_id,quantity,reserved_quantity,updated_at'),
    'warehouses': ('inventory.warehouses', 'warehouse_id,name,city,capacity_units'),
    'warehouse_metadata': ('inventory.warehouses', 'warehouse_id,classification'),
}
TRANSFORM_VERSION = 'phase8-operational-metadata-v1'


def customer_key(identifier):
    return hmac.new(env()['ANALYTICS_PSEUDONYM_KEY'].encode(), str(identifier).encode(), hashlib.sha256).hexdigest()


def capture():
    with connect('reader') as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        boundary = conn.execute('SELECT transaction_timestamp() AS cutoff,txid_current_snapshot()::text AS boundary').fetchone()
        data = {}
        for name, (table, columns) in COLUMNS.items():
            data[name] = conn.execute(f'SELECT {columns} FROM {table} ORDER BY 1,2').fetchall()
    for name in ('customers', 'orders'):
        for row in data[name]:
            row['customer_key'] = customer_key(row.pop('customer_id'))
    # Classification is a labelled current projection, not a frozen historical category.
    c = env()
    response = httpx.post(c.get('ANALYTICS_CATALOG_URL', 'http://127.0.0.1:8080/graphql'),
        json={'query': '{products(pageSize:100){items{productId name category publicationVersion}}}'},
        timeout=10, trust_env=False)
    response.raise_for_status()
    result = response.json()
    if result.get('errors'):
        raise RuntimeError('CATALOG_CLASSIFICATION_UNAVAILABLE')
    data['classification'] = sorted(result['data']['products']['items'], key=lambda r: int(r['productId']))
    if any(row['currency'] != 'EUR' for name in ('orders', 'payments') for row in data[name]):
        raise RuntimeError('UNSUPPORTED_SOURCE_CURRENCY')
    if any(row['quantity'] < row['reserved_quantity'] or row['reserved_quantity'] < 0 for row in data['inventory']):
        raise RuntimeError('INVALID_SOURCE_STOCK')
    orders = {row['order_id']: row for row in data['orders']}
    line_totals = {}
    for row in data['order_lines']:
        line_totals[row['order_id']] = line_totals.get(row['order_id'], 0) + row['quantity'] * row['unit_price_cents']
    if any(line_totals.get(identifier, 0) != row['total_cents'] for identifier, row in orders.items()):
        raise RuntimeError('SOURCE_ORDER_LINE_TOTAL_MISMATCH')
    captured = set()
    for row in data['payments']:
        if row['order_id'] not in orders or row['amount_cents'] != orders[row['order_id']]['total_cents']:
            raise RuntimeError('SOURCE_PAYMENT_ORDER_MISMATCH')
        if row['status'] in ('SUCCEEDED', 'REFUNDED'):
            if row['order_id'] in captured:
                raise RuntimeError('MULTIPLE_SOURCE_CAPTURES')
            captured.add(row['order_id'])
    encoded = json.dumps(data, sort_keys=True, default=str, separators=(',', ':'))
    return json.loads(encoded), boundary, hashlib.sha256((TRANSFORM_VERSION + encoded).encode()).hexdigest()
