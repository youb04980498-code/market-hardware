"""Run inside the Spark image while the analytics worker is stopped.

All writes use an isolated prefix. Live Delta versions and checkpoints are retained.
"""
import json
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, uuid4, uuid5

from delta.tables import DeltaTable
from pyspark.sql import functions as F

from market_analytics.alerts import windowed_orders
from market_analytics.spark import path, session


def main():
    spark = session()
    identity = uuid4().hex
    try:
        table = DeltaTable.forPath(spark, path('curated/orders'))
        history = table.history().select('version', 'timestamp', 'operation').collect()
        assert history
        version = min(row['version'] for row in history)
        historical = spark.read.format('delta').option('versionAsOf', version).load(path('curated/orders'))
        original_count = historical.count()
        isolated = path('recovery/phase8/' + identity + '/orders')
        historical.write.format('delta').mode('errorifexists').save(isolated)
        assert spark.read.format('delta').load(isolated).count() == original_count
        # Match full row content, not only a count.
        restored = spark.read.format('delta').load(isolated)
        assert historical.exceptAll(restored).count() == 0
        assert restored.exceptAll(historical).count() == 0
        results = []
        directory = Path(tempfile.mkdtemp(prefix='phase8-window-'))
        source = spark.readStream.schema('value string').json(str(directory))
        checkpoint = path('recovery/phase8/' + identity + '/window-checkpoint')
        def emit(batch, batch_id):
            results.extend(row.asDict(recursive=True) for row in batch.collect())
        def start():
            return (windowed_orders(source).writeStream.outputMode('update').foreachBatch(emit)
                .option('checkpointLocation', checkpoint).start())
        query = start()
        base = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        def put(number, events):
            (directory / f'{number}.json').write_text('\n'.join(json.dumps({'value': json.dumps({
                'event_id': str(uuid5(NAMESPACE_URL, event_id)), 'event_type': 'order.created', 'occurred_at': at.isoformat(),
                'version': 1, 'source': 'orders', 'aggregate_id': 'isolated-test', 'aggregate_type': 'order',
                'correlation_id': str(uuid5(NAMESPACE_URL, event_id)), 'causation_id': None, 'idempotency_key': None, 'payload': {}})})
                for event_id, at in events), encoding='utf-8')
            query.processAllAvailable()
        put(1, [('a', base), ('b', base + timedelta(seconds=30)), ('a', base)])
        assert any(r['count'] == 2 for r in results)
        query.stop()
        query = start()
        put(2, [('a', base), ('c', base + timedelta(seconds=60))])
        assert max(r['count'] for r in results if r['window']['start'].replace(tzinfo=UTC) == base) == 3
        put(3, [('future', base + timedelta(minutes=25))])
        put(4, [('late', base + timedelta(seconds=10))])
        assert max(r['count'] for r in results if r['window']['start'].replace(tzinfo=UTC) == base) == 3
        dropped = sum(s.get('numRowsDroppedByWatermark', 0) for p in query.recentProgress for s in p.get('stateOperators', []))
        assert dropped > 0
        query.stop()
        # Verify four persisted logical zones and pseudonymized staging.
        for zone in ('raw/source_snapshots', 'staging/orders', 'curated/orders', 'consumption/overview'):
            assert DeltaTable.isDeltaTable(spark, path(zone))
        staging = spark.read.format('delta').load(path('staging/orders'))
        assert 'customer_id' not in staging.columns and 'email' not in staging.columns
        assert staging.where(~F.col('customer_key').rlike('^[0-9a-f]{64}$')).count() == 0
        print(json.dumps({'delta_versions': len(history), 'restored_version': version,
            'restored_rows': original_count, 'isolated_path': isolated,
            'window_dedup_restart': 'PASS', 'late_events_dropped': dropped,
            'four_zones': 'PASS', 'pseudonymization': 'PASS'}))
    finally:
        spark.stop()


if __name__ == '__main__':
    main()
