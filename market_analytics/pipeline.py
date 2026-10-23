import json
import os
import time

from psycopg.types.json import Jsonb
from pyspark.sql import functions as F

from market_analytics.config import bucket, connect, s3
from market_analytics.model import (
    KEYS,
    SCHEMAS,
    build_gold,
    quarter_bounds,
    source_totals,
)
from market_analytics.source import TRANSFORM_VERSION, capture
from market_analytics.spark import merge, path


def status(state, error=None, metrics=None, successful=False):
    with connect() as conn:
        conn.execute('''INSERT INTO pipeline_status(singleton,state,error_code,metrics,last_success_at)
            VALUES(true,%s,%s,%s,CASE WHEN %s THEN now() END)
            ON CONFLICT(singleton) DO UPDATE SET checked_at=now(),state=excluded.state,
            error_code=CASE WHEN %s THEN NULL WHEN excluded.error_code IS NOT NULL THEN excluded.error_code ELSE pipeline_status.error_code END,
            metrics=CASE WHEN %s THEN pipeline_status.metrics||excluded.metrics ELSE pipeline_status.metrics END,
            last_success_at=CASE WHEN %s THEN now() ELSE pipeline_status.last_success_at END''',
            (state, error, Jsonb(metrics or {}), successful, successful, metrics is not None, successful))


def rows(frame):
    return [json.loads(line) for line in frame.toJSON().collect()]


def publish(release_id, cutoff, document, fault=None):
    with connect() as conn:
        conn.execute('''INSERT INTO releases(release_id,snapshot_at,lake_path,document) VALUES(%s,%s,%s,%s)
            ON CONFLICT(release_id) DO NOTHING''', (release_id, cutoff, path('consumption/manifests'), Jsonb(document)))
        if fault == 'crash_before_pointer':
            os._exit(76)
        if fault == 'before_pointer':
            raise RuntimeError('INJECTED_PROJECTION_INTERRUPTION')
        conn.execute('''INSERT INTO current_release(singleton,release_id) VALUES(true,%s)
            ON CONFLICT(singleton) DO UPDATE SET release_id=excluded.release_id''', (release_id,))


def refresh(spark, force=False, fault=None):
    began = time.monotonic()
    status('REFRESHING')
    s3().head_bucket(Bucket=bucket())
    data, boundary, release_id = capture()
    with connect() as conn:
        current = conn.execute('SELECT release_id FROM current_release').fetchone()
        if current and current['release_id'] == release_id and not force and not fault:
            status('RUNNING', successful=True)
            return {'release_id': release_id, 'unchanged': True}
    cutoff = boundary['cutoff']
    raw = spark.createDataFrame([(release_id, cutoff.isoformat(), json.dumps(data))], 'release_id string,observed_at string,payload string')
    merge(spark, raw, 'raw/source_snapshots', ['release_id'])
    for name, schema in SCHEMAS.items():
        frame = spark.read.schema(schema).json(spark.sparkContext.parallelize([json.dumps(row) for row in data[name]], 1))
        frame = frame.withColumn('release_id', F.lit(release_id)).withColumn('observed_at', F.lit(cutoff).cast('timestamp'))
        for column in ('created_at', 'updated_at'):
            if column in frame.columns:
                frame = frame.withColumn(column, F.to_timestamp(column))
        merge(spark, frame, 'curated/' + name, ['release_id', *KEYS[name]])
        spark.read.format('delta').load(path('curated/' + name)).where(F.col('release_id') == release_id).createOrReplaceTempView(name)
    gold = build_gold(spark)
    document = {'release_id': release_id, 'snapshot_at': cutoff.isoformat(), 'snapshot_boundary': boundary['boundary'],
        'currency': 'EUR', 'timezone': 'UTC', 'transform_version': TRANSFORM_VERSION, 'classification_basis': 'current_published_category_or_UNKNOWN',
        'revenue_basis': 'payment_creation_cohort_with_latest_known_refunds', 'tables': {}}
    for name, frame in gold.items():
        materialized = frame.withColumn('release_id', F.lit(release_id))
        # The key is the complete deterministic row for an immutable release; duplicates are not transactions.
        materialized = materialized.withColumn('row_key', F.sha2(F.to_json(F.struct(*[F.col(c) for c in frame.columns])), 256))
        merge(spark, materialized, 'consumption/' + name, ['release_id', 'row_key'])
        document['tables'][name] = rows(spark.read.format('delta').load(path('consumption/' + name))
            .where(F.col('release_id') == release_id).drop('release_id', 'row_key'))
    expected = source_totals(data)
    analytical = document['tables']['overview'][0]
    checks = [{ 'metric': key, 'source': value, 'analytical': analytical[key], 'difference': analytical[key] - value}
        for key, value in expected.items()]
    product = document['tables']['product_performance']
    for key in ('gross_cents', 'refunded_cents', 'net_cents'):
        value = sum(p[key] for p in product)
        checks.append({'metric': 'product_' + key, 'source': expected[key], 'analytical': value, 'difference': value - expected[key]})
    for field in ('quantity', 'reserved_quantity'):
        source = sum(r[field] for r in data['inventory'])
        analytical_stock = sum(r[field] for r in document['tables']['inventory_snapshot'])
        checks.append({'metric': 'inventory_' + field, 'source': source,
            'analytical': analytical_stock, 'difference': analytical_stock - source})
    for source_name, target_name, field in [('customers', 'customers_daily', 'registered_customers')]:
        source = len(data[source_name])
        value = sum(r[field] for r in document['tables'][target_name])
        checks.append({'metric': field, 'source': source, 'analytical': value, 'difference': value - source})
    document['reconciliation'] = {'status': 'PASS' if all(c['difference'] == 0 for c in checks) else 'FAIL',
        'source_boundary': boundary['boundary'], 'checked_at': cutoff.isoformat(), 'checks': checks}
    if document['reconciliation']['status'] != 'PASS':
        raise RuntimeError('FINANCIAL_RECONCILIATION_FAILED')
    if analytical['refunded_cents'] > analytical['gross_cents'] or any(p['net_cents'] < 0 for p in product):
        raise RuntimeError('INVALID_REFUND_BALANCE')
    manifest = spark.createDataFrame([(release_id, json.dumps(document))], 'release_id string,document string')
    merge(spark, manifest, 'consumption/manifests', ['release_id'])
    # Serving is read back from committed Delta rather than publishing an uncommitted Python result.
    committed = spark.read.format('delta').load(path('consumption/manifests')).where(F.col('release_id') == release_id).first()
    publish(release_id, cutoff, json.loads(committed['document']), fault)
    status('RUNNING', metrics={'last_refresh_seconds': round(time.monotonic() - began, 3), 'release_id': release_id}, successful=True)
    return {'release_id': release_id, 'unchanged': False, 'reconciliation': document['reconciliation']}


def quarterly(spark, year, quarter):
    from market_analytics.serving import report_for_period
    start, end = quarter_bounds(year, quarter)
    refresh(spark)
    # Read the committed Delta manifest named by the published release pointer.
    with connect() as conn:
        rid = conn.execute('SELECT release_id FROM current_release').fetchone()['release_id']
    manifest = spark.read.format('delta').load(path('consumption/manifests')).where(F.col('release_id') == rid).first()
    document = json.loads(manifest['document'])
    report = report_for_period(document, start.date().isoformat(), end.date().isoformat())
    report.update(period=f'{year}-Q{quarter}', release_id=rid, boundary_start=start.isoformat(), boundary_end_exclusive=end.isoformat())
    frame = spark.createDataFrame([(report['period'], rid, json.dumps(report))], 'period string,release_id string,document string')
    merge(spark, frame, 'consumption/quarterly_reports', ['period', 'release_id'])
    persisted = spark.read.format('delta').load(path('consumption/quarterly_reports')).where(
        (F.col('period') == report['period']) & (F.col('release_id') == rid)).first()
    with connect() as conn:
        conn.execute('''INSERT INTO quarterly_reports(period,release_id,document) VALUES(%s,%s,%s)
            ON CONFLICT(period,release_id) DO NOTHING''', (report['period'], rid, Jsonb(json.loads(persisted['document']))))
    return report
