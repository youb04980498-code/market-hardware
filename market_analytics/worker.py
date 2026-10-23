import base64
import hashlib
import json
import logging
import threading
import time
from datetime import UTC, datetime
from functools import wraps

from confluent_kafka import Consumer, TopicPartition
from delta.tables import DeltaTable
from psycopg.types.json import Jsonb
from pyspark.sql import Window
from pyspark.sql import functions as F

from market_analytics.config import TOPICS, connect, env, writer_lock
from market_analytics.events import parse_record
from market_analytics.pipeline import quarterly, refresh, status
from market_analytics.spark import merge, path, session

BRONZE_SCHEMA = '''transport_id string,topic string,partition int,offset long,kafka_key string,
    kafka_timestamp string,raw_payload string,raw_base64 string,payload_hash string,ingested_at string,
    event_id string,event_type string,event_version int,occurred_at string,business_identity string,
    parsing_status string,error_code string,late boolean'''
SERIAL = threading.RLock()
LOG = logging.getLogger('market-analytics')


def serialized(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        with SERIAL:
            return function(*args, **kwargs)
    return wrapped


@serialized
def ingest(spark, batch, batch_id):
    records = []
    for row in batch.select('topic', 'partition', 'offset', 'key', 'value', 'timestamp').collect():
        body = bytes(row['value'] or b'')
        raw = body.decode('utf-8', errors='replace')
        record = parse_record(row['topic'], row['partition'], row['offset'],
            bytes(row['key']).decode('utf-8', errors='replace') if row['key'] else None,
            raw, row['timestamp'].replace(tzinfo=UTC))
        record['raw_base64'] = base64.b64encode(body).decode()
        try:
            record['payload_hash'] = hashlib.sha256(json.dumps(json.loads(raw), sort_keys=True).encode()).hexdigest()
        except ValueError:
            record['payload_hash'] = hashlib.sha256(body).hexdigest()
        if body.decode('utf-8', errors='replace').encode('utf-8') != body:
            record.update(parsing_status='INVALID', error_code='INVALID_UTF8')
        records.append(record)
    if not records:
        return
    frame = spark.createDataFrame(records, BRONZE_SCHEMA)
    merge(spark, frame, 'raw/kafka_events', ['transport_id'])
    raw = spark.read.format('delta').load(path('raw/kafka_events'))
    conflicts = raw.where("parsing_status='VALID'").groupBy('business_identity').agg(
        F.countDistinct('payload_hash').alias('payload_versions')).where('payload_versions>1').select('business_identity')
    bad = raw.where("parsing_status<>'VALID'").unionByName(
        raw.join(conflicts, 'business_identity').withColumn('parsing_status', F.lit('INVALID')).withColumn('error_code', F.lit('CONFLICTING_EVENT_ID')))
    merge(spark, bad, 'staging/invalid_events', ['transport_id'])
    valid = raw.where("parsing_status='VALID'").join(conflicts, 'business_identity', 'left_anti')
    window = Window.partitionBy('business_identity').orderBy('topic', 'partition', 'offset')
    unique = valid.withColumn('_rank', F.row_number().over(window)).where('_rank=1').drop('_rank')
    merge(spark, unique, 'curated/events', ['business_identity'])
    # Retain the original row and Delta history, but revoke its valid classification
    # when a later delivery reuses the identity for different content.
    (DeltaTable.forPath(spark, path('curated/events')).alias('target')
        .merge(conflicts.alias('conflict'), 'target.business_identity=conflict.business_identity')
        .whenMatchedUpdate(set={'parsing_status': "'INVALID'", 'error_code': "'CONFLICTING_EVENT_ID'"}).execute())
    counts = raw.groupBy('parsing_status').count().collect()
    total = sum(r['count'] for r in counts)
    invalid = bad.select('transport_id').distinct().count()
    valid_count = valid.count()
    distinct = unique.count()
    status('RUNNING', metrics={'bronze_records': total, 'invalid_records': invalid,
        'unique_events': distinct, 'duplicate_records': valid_count - distinct,
        'late_records': raw.where('late').count(), 'last_ingestion_at': datetime.now(UTC).isoformat(),
        'last_batch_id': batch_id, 'batch_input_rows': len(records)})
    refresh(spark)


def measure_lag(query):
    progress = query.lastProgress
    if not progress or not progress.get('sources'):
        return
    end = progress['sources'][0].get('endOffset')
    if isinstance(end, str):
        end = json.loads(end)
    if not isinstance(end, dict):
        return
    probe = Consumer({'bootstrap.servers': env().get('KAFKA_BOOTSTRAP_SERVERS', 'kafka:19092'),
        'group.id': 'market-analytics-read-only-lag-probe', 'enable.auto.commit': False, 'log_level': 0})
    lag, partitions = 0, []
    try:
        for topic, positions in end.items():
            for partition, offset in positions.items():
                low, high = probe.get_watermark_offsets(TopicPartition(topic, int(partition)), timeout=3)
                lag += max(0, high - int(offset))
                partitions.append({'topic': topic, 'partition': int(partition), 'retained_start': low, 'end_offset': high, 'processed_end_offset': int(offset)})
    finally:
        probe.close()
    with connect() as conn:
        conn.execute('''UPDATE pipeline_status SET metrics=metrics||%s WHERE singleton''',
            (Jsonb({'kafka_lag': lag, 'lag_measured_at': datetime.now(UTC).isoformat(), 'partition_progress': partitions,
                'input_rows_per_second': progress.get('inputRowsPerSecond'),
                'processed_rows_per_second': progress.get('processedRowsPerSecond'),
                'last_batch_duration_ms': progress.get('durationMs', {}).get('triggerExecution')}),))


@serialized
def process_job(spark):
    with connect() as conn:
        job = conn.execute("SELECT * FROM jobs WHERE status='QUEUED' ORDER BY submitted_at FOR UPDATE SKIP LOCKED LIMIT 1").fetchone()
        if not job:
            return False
        conn.execute("UPDATE jobs SET status='RUNNING',started_at=now() WHERE job_id=%s", (job['job_id'],))
        if job['fault']:
            conn.execute('UPDATE jobs SET fault=NULL WHERE job_id=%s', (job['job_id'],))
    try:
        if job['fault'] and env().get('ANALYTICS_TESTING') != '1':
            raise RuntimeError('ANALYTICS_FAULT_CONTROLS_DISABLED')
        result = refresh(spark, fault=job['fault']) if job['kind'] == 'backfill' else quarterly(spark, job['year'], job['quarter'])
        state, error = 'COMPLETE', None
    except Exception as exc:  # noqa: BLE001 -- durable operational boundary
        result, state, error = None, 'ERROR', type(exc).__name__
    with connect() as conn:
        conn.execute('UPDATE jobs SET status=%s,error_code=%s,result=%s,completed_at=now() WHERE job_id=%s',
            (state, error, Jsonb(result), job['job_id']))
    metadata = spark.createDataFrame([(str(job['job_id']), job['kind'], state, error, datetime.now(UTC).isoformat())],
        'job_id string,kind string,status string,error_code string,completed_at string')
    merge(spark, metadata, 'metadata/batch_runs', ['job_id'])
    return True


def main():
    logging.basicConfig(level=logging.INFO)
    with writer_lock():
        status('STARTING')
        spark = session()
        try:
            with connect() as conn:
                conn.execute("UPDATE jobs SET status='QUEUED' WHERE status='RUNNING'")
            refresh(spark)
            query = (spark.readStream.format('kafka')
                .option('kafka.bootstrap.servers', env().get('KAFKA_BOOTSTRAP_SERVERS', 'kafka:19092'))
                .option('subscribe', ','.join(TOPICS)).option('startingOffsets', 'earliest')
                .option('failOnDataLoss', 'true').option('maxOffsetsPerTrigger', 1000).load()
                .writeStream.foreachBatch(lambda frame, bid: ingest(spark, frame, bid))
                .option('checkpointLocation', path('checkpoints/kafka_ingestion_v1'))
                .trigger(processingTime='15 seconds').start())
            refreshed = time.monotonic()
            while query.isActive:
                query.awaitTermination(2)
                if process_job(spark):
                    refreshed = time.monotonic()
                if time.monotonic() - refreshed >= int(env().get('ANALYTICS_REFRESH_SECONDS', '60')):
                    with SERIAL:
                        refresh(spark)
                        measure_lag(query)
                    refreshed = time.monotonic()
            if query.exception():
                raise RuntimeError('STREAM_TERMINATED')
        except Exception as exc:
            status('ERROR', type(exc).__name__)
            LOG.error('Analytics worker stopped: %s', type(exc).__name__)
            raise
        finally:
            spark.stop()


if __name__ == '__main__':
    main()
