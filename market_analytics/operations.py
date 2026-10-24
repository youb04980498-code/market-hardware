"""Role-protected operational APIs; monitoring endpoints are proxied server-side."""
from uuid import UUID

import httpx
from fastapi import Depends, Query

from market_analytics.config import connect, env
from market_commerce.common import fail


def register(app, staff):
    user_dep = Depends(staff)

    @app.get('/api/analytics/operations/today')
    def today(user=user_dep):
        from datetime import UTC, datetime, timedelta

        from market_analytics.serving import current, report_for_period
        doc, meta = current()
        start = datetime.now(UTC).date()
        report = report_for_period(doc, start.isoformat(), (start + timedelta(days=1)).isoformat())
        return {'data': {k: report[k] for k in ('order_count', 'gross_cents', 'net_cents', 'aov_cents')},
            'hourly': [r for r in doc['tables'].get('orders_hourly', []) if r['date'] == start.isoformat()],
            'low_stock_count': sum(r['available'] <= int(env().get('ANALYTICS_LOW_STOCK_THRESHOLD', '5'))
                for r in doc['tables']['inventory_snapshot']
                if doc.get('warehouse_classification', {}).get(str(r['warehouse_id']), 'OPERATIONAL') == 'OPERATIONAL'),
            'metadata': meta}

    @app.get('/api/analytics/alerts')
    def alerts(status: str | None = Query(None, pattern='^(ACTIVE|ACKNOWLEDGED|RESOLVED)$'),
               limit: int = Query(100, ge=1, le=500), user=user_dep):
        with connect('api') as conn:
            return {'items': conn.execute('''SELECT * FROM operational_alerts WHERE
                (%s::text IS NULL OR status=%s) ORDER BY last_observed_at DESC LIMIT %s''', (status, status, limit)).fetchall()}

    @app.get('/api/analytics/alerts/{alert_id}')
    def detail(alert_id: UUID, user=user_dep):
        with connect('api') as conn:
            row = conn.execute('SELECT * FROM operational_alerts WHERE alert_id=%s', (alert_id,)).fetchone()
        if not row:
            fail(404, 'ALERT_NOT_FOUND', 'Alert not found')
        return row

    def transition(alert_id, status, user):
        with connect('api') as conn:
            # API role stays read-only by default. Only explicitly granted alert columns can be written.
            conn.execute('SET TRANSACTION READ WRITE')
            row = conn.execute('SELECT * FROM operational_alerts WHERE alert_id=%s FOR UPDATE', (alert_id,)).fetchone()
            if not row:
                fail(404, 'ALERT_NOT_FOUND', 'Alert not found')
            if row['status'] == 'RESOLVED' and status == 'ACKNOWLEDGED':
                fail(409, 'ALERT_RESOLVED', 'Resolved alerts cannot be acknowledged')
            if row['status'] != status:
                conn.execute('''UPDATE operational_alerts SET status=%s,
                    resolved_at=CASE WHEN %s='RESOLVED' THEN now() ELSE NULL END,
                    acknowledged_at=CASE WHEN %s='ACKNOWLEDGED' THEN now() ELSE acknowledged_at END
                    WHERE alert_id=%s''', (status, status, status, alert_id))
                conn.execute('INSERT INTO alert_actions(alert_id,actor_id,action) VALUES(%s,%s,%s)',
                             (alert_id, user['user_id'], status))
            return {'alert_id': alert_id, 'status': status}

    @app.post('/api/analytics/alerts/{alert_id}/acknowledge')
    def acknowledge(alert_id: UUID, user=user_dep):
        return transition(alert_id, 'ACKNOWLEDGED', user)

    @app.post('/api/analytics/alerts/{alert_id}/resolve')
    def resolve(alert_id: UUID, user=user_dep):
        return transition(alert_id, 'RESOLVED', user)

    @app.get('/api/analytics/observability')
    def observability(user=user_dep):
        queries = {
            'availability': 'up',
            'request_rate': 'sum by(service)(rate(market_http_requests_total[5m]))',
            'error_rate': 'sum by(service)(rate(market_http_requests_total{status=~"5.."}[5m]))',
            'p95_seconds': 'histogram_quantile(0.95,sum by(le,service)(rate(market_http_duration_seconds_bucket[5m])))',
            'p50_seconds': 'histogram_quantile(0.50,sum by(le,service)(rate(market_http_duration_seconds_bucket[5m])))',
            'p99_seconds': 'histogram_quantile(0.99,sum by(le,service)(rate(market_http_duration_seconds_bucket[5m])))',
            'process_cpu': 'rate(process_cpu_seconds_total{job="commerce"}[5m])',
            'process_memory_bytes': 'process_resident_memory_bytes{job="commerce"}',
            'kafka_lag': 'market_kafka_lag', 'freshness_seconds': 'market_analytics_freshness_seconds',
            'spark_input_rate': 'market_spark_input_rows_per_second',
        }
        result, errors = {}, []
        with httpx.Client(timeout=3, trust_env=False) as client:
            for key, query in queries.items():
                try:
                    response = client.get(env().get('PROMETHEUS_URL', 'http://prometheus:9090') + '/api/v1/query', params={'query': query})
                    response.raise_for_status()
                    result[key] = response.json()['data']['result']
                except (httpx.HTTPError, ValueError, KeyError):
                    result[key] = None
                    errors.append(key)
            try:
                response = client.get(env().get('ALERTMANAGER_URL', 'http://alertmanager:9093') + '/api/v2/alerts')
                response.raise_for_status()
                result['infrastructure_alerts'] = response.json()
            except (httpx.HTTPError, ValueError):
                result['infrastructure_alerts'] = None
                errors.append('infrastructure_alerts')
        from datetime import UTC, datetime
        return {'observed_at': datetime.now(UTC).isoformat(), 'infrastructure_alerts': result.pop('infrastructure_alerts', None), 'metrics': result, 'unavailable': errors, 'links': {
            'grafana': 'http://localhost:3000', 'tracing': 'http://localhost:16686',
            'prometheus': 'http://localhost:9090'}}

    @app.get('/api/analytics/observability/history')
    def metric_history(user=user_dep):
        # Bounded fixed queries: the browser cannot submit PromQL, URLs or arbitrary time spans.
        from datetime import UTC, datetime
        end = int(datetime.now(UTC).timestamp())
        queries = {
            'p50': 'histogram_quantile(0.5,sum by(le,service)(rate(market_http_duration_seconds_bucket[5m])))',
            'p95': 'histogram_quantile(0.95,sum by(le,service)(rate(market_http_duration_seconds_bucket[5m])))',
            'p99': 'histogram_quantile(0.99,sum by(le,service)(rate(market_http_duration_seconds_bucket[5m])))',
            'traffic': 'sum by(service)(rate(market_http_requests_total[5m]))',
            'errors': 'sum by(service)(rate(market_http_requests_total{status=~"5.."}[5m]))',
        }
        result, unavailable = {}, []
        with httpx.Client(timeout=3, trust_env=False) as client:
            for key, query in queries.items():
                try:
                    response = client.get(env().get('PROMETHEUS_URL', 'http://prometheus:9090') + '/api/v1/query_range',
                        params={'query': query, 'start': end - 1800, 'end': end, 'step': 60})
                    response.raise_for_status()
                    result[key] = response.json()['data']['result']
                except (httpx.HTTPError, ValueError, KeyError):
                    result[key] = None
                    unavailable.append(key)
        return {'observed_at': datetime.now(UTC).isoformat(), 'window_seconds': 1800,
            'step_seconds': 60, 'series': result, 'unavailable': unavailable}

    @app.get('/api/analytics/observability/traces')
    def recent_traces(service: str = Query('orders', pattern='^(auth|orders|inventory|payments|catalog|analytics)$'), user=user_dep):
        # Only a safe summary. No headers, span attributes, logs or customer data leave the server.
        try:
            with httpx.Client(timeout=3, trust_env=False) as client:
                response = client.get(env().get('JAEGER_QUERY_URL', 'http://jaeger:16686') + '/api/traces',
                    params={'service': service, 'limit': 10, 'lookback': '1h'})
                response.raise_for_status()
                traces = [trace_summary(t, service) for t in response.json()['data'][:10]]
            return {'items': traces, 'unavailable': False}
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            return {'items': [], 'unavailable': True}


def trace_summary(trace, service):
    spans = trace.get('spans', [])
    processes = trace.get('processes', {})
    own = [s for s in spans if processes.get(s.get('processID'), {}).get('serviceName') == service]
    root = min(own or spans, key=lambda s: s.get('startTime', 0), default={})
    return {'trace_id': trace['traceID'], 'service': service, 'operation': root.get('operationName', 'Unknown'),
        'duration_ms': root.get('duration', 0) / 1000, 'started_at_us': root.get('startTime'),
        'error': any(t.get('key') == 'error' and t.get('value') is True for s in spans for t in s.get('tags', []))}
