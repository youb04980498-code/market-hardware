"""Actual pipeline gauges read from the serving database; absent observations stay absent."""
from datetime import UTC, datetime

from prometheus_client.core import REGISTRY, GaugeMetricFamily

from market_analytics.config import connect


class PipelineCollector:
    def describe(self):
        return []

    def collect(self):
        with connect('api') as conn:
            row = conn.execute('SELECT * FROM pipeline_status WHERE singleton').fetchone()
            alerts = conn.execute("SELECT type,count(*) AS n FROM operational_alerts WHERE status<>'RESOLVED' GROUP BY type").fetchall()
            jobs = conn.execute('SELECT * FROM operational_batch_metrics').fetchall()
            release = conn.execute('SELECT r.document FROM releases r JOIN current_release c USING(release_id)').fetchone()
        if row:
            metrics = row['metrics']
            fields = {'kafka_lag': 'market_kafka_lag', 'input_rows_per_second': 'market_spark_input_rows_per_second',
                'processed_rows_per_second': 'market_spark_processed_rows_per_second',
                'invalid_records': 'market_quarantine_records', 'duplicate_records': 'market_duplicate_records',
                'last_refresh_seconds': 'market_analytics_refresh_seconds'}
            for field, name in fields.items():
                if metrics.get(field) is not None:
                    gauge = GaugeMetricFamily(name, field)
                    gauge.add_metric([], float(metrics[field]))
                    yield gauge
            if row['last_success_at']:
                gauge = GaugeMetricFamily('market_analytics_freshness_seconds', 'Age of last verified snapshot')
                gauge.add_metric([], (datetime.now(UTC) - row['last_success_at']).total_seconds())
                yield gauge
            gauge = GaugeMetricFamily('market_pipeline_healthy', 'Pipeline running without a recorded error')
            gauge.add_metric([], int(row['state'] in ('RUNNING', 'REFRESHING') and not row['error_code']))
            yield gauge
        gauge = GaugeMetricFamily('market_operational_alerts', 'Unresolved operational alerts', labels=['type'])
        for row in alerts:
            gauge.add_metric([row['type']], row['n'])
        yield gauge
        gauge = GaugeMetricFamily('market_spark_batch_jobs', 'Persisted Spark job outcomes', labels=['kind', 'status'])
        for job in jobs:
            gauge.add_metric([job['kind'], job['status']], job['count'])
        yield gauge
        if release:
            gauge = GaugeMetricFamily('market_reconciliation_healthy', 'Last committed release reconciles exactly')
            gauge.add_metric([], int(release['document']['reconciliation']['status'] == 'PASS'))
            yield gauge


def register():
    REGISTRY.register(PipelineCollector())
