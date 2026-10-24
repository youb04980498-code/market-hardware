"""Durable identities; snapshot alerts reconcile actual authoritative Inventory exports."""
from uuid import NAMESPACE_URL, uuid5

from psycopg.types.json import Jsonb

from market_analytics.config import connect, env


def upsert(conn, kind, entity, details, source='authoritative_snapshot', severity='warning'):
    identity = kind + ':' + str(entity)
    conn.execute('''INSERT INTO operational_alerts(alert_id,identity,type,severity,source,entity_reference,details)
        VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(identity) DO UPDATE
        SET last_observed_at=now(),details=excluded.details,
        status=CASE WHEN operational_alerts.status='RESOLVED' THEN 'ACTIVE' ELSE operational_alerts.status END,
        resolved_at=NULL''', (uuid5(NAMESPACE_URL, identity), identity, kind, severity, source, str(entity), Jsonb(details)))


def reconcile(data):
    threshold = int(env().get('ANALYTICS_LOW_STOCK_THRESHOLD', '5'))
    saturation = float(env().get('WAREHOUSE_SATURATION_PERCENT', '90'))
    active = []
    totals = {}
    with connect() as conn:
        for row in data['inventory']:
            wid = row['warehouse_id']
            totals[wid] = totals.get(wid, 0) + row['quantity']
            available = row['quantity'] - row['reserved_quantity']
            if available <= threshold:
                entity = f"{wid}:{row['product_id']}"
                active.append('LOW_STOCK:' + entity)
                upsert(conn, 'LOW_STOCK', entity, {'warehouse_id': wid, 'product_id': row['product_id'],
                    'available': available, 'threshold': threshold})
        for row in data['warehouses']:
            capacity = row['capacity_units']
            utilization = totals.get(row['warehouse_id'], 0) * 100 / capacity if capacity else None
            if utilization is not None and utilization > saturation:
                entity = str(row['warehouse_id'])
                active.append('WAREHOUSE_SATURATION:' + entity)
                upsert(conn, 'WAREHOUSE_SATURATION', entity, {'utilization_percent': utilization,
                    'capacity_units': capacity, 'unit': 'physical_item', 'threshold': saturation})
        conn.execute("""UPDATE operational_alerts SET status='RESOLVED',resolved_at=now()
            WHERE type IN ('LOW_STOCK','WAREHOUSE_SATURATION') AND status<>'RESOLVED'
            AND NOT(identity=ANY(%s))""", (active,))
        for row in data['payments']:
            if row['status'] == 'FAILED':
                identity = 'PAYMENT_FAILURE:' + str(row['payment_id'])
                # Failure events are incidents: resolved incidents do not reopen on snapshot replay.
                if not conn.execute('SELECT 1 FROM operational_alerts WHERE identity=%s', (identity,)).fetchone():
                    upsert(conn, 'PAYMENT_FAILURE', row['payment_id'], {'order_id': row['order_id'],
                        'failure_category': 'PAYMENT_FAILED', 'occurred_at': row['created_at']}, severity='critical')


def spikes(batch, batch_id):
    minimum = int(env().get('ORDER_SPIKE_MIN_COUNT', '10'))
    baseline = float(env().get('ORDER_SPIKE_BASELINE_PER_5M', '5'))
    factor = float(env().get('ORDER_SPIKE_FACTOR', '3'))
    with connect() as conn:
        for row in batch.collect():
            if row['count'] >= minimum and row['count'] >= baseline * factor:
                start = row['window']['start'].isoformat()
                upsert(conn, 'ORDER_SPIKE', start, {'window_start': start,
                    'window_end': row['window']['end'].isoformat(), 'count': row['count'],
                    'baseline': baseline, 'factor': factor, 'minimum': minimum}, source='spark_event_time')


def valid_order_event(raw):
    import json

    from market_analytics.events import VALIDATOR
    try:
        doc = json.loads(raw)
        return (isinstance(doc, dict) and doc.get('source') == 'orders'
            and doc.get('event_type') == 'order.created' and not list(VALIDATOR.iter_errors(doc)))
    except (ValueError, TypeError):
        return False


def windowed_orders(source):
    from pyspark.sql import functions as F
    # Only new order creation events; persisted 10-minute watermark bounds state.
    valid = source.where(F.udf(valid_order_event, 'boolean')(F.col('value').cast('string')))
    frame = valid.select(F.get_json_object(F.col('value').cast('string'), '$.event_id').alias('event_id'),
        F.get_json_object(F.col('value').cast('string'), '$.event_type').alias('event_type'),
        F.to_timestamp(F.get_json_object(F.col('value').cast('string'), '$.occurred_at')).alias('event_time'))
    return (frame.where("event_type='order.created' AND event_id IS NOT NULL AND event_time IS NOT NULL")
        .withWatermark('event_time', '10 minutes').dropDuplicatesWithinWatermark(['event_id'])
        .groupBy(F.window('event_time', '5 minutes')).count())
