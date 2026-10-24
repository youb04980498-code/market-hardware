"""Low-cardinality HTTP metrics and W3C tracing, without request bodies or secrets."""
import json
import logging
import os
import time

from fastapi import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

REQUESTS = Counter('market_http_requests_total', 'Completed HTTP requests', ['service', 'method', 'route', 'status'])
LATENCY = Histogram('market_http_duration_seconds', 'HTTP response time', ['service', 'method', 'route'],
                    buckets=(.005, .01, .025, .05, .1, .25, .5, 1, 2, 5, 10))
LOG = logging.getLogger('market.requests')
PROVIDERS = {}


def instrument(app, service):
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    endpoint = os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT')
    if endpoint:
        provider = PROVIDERS.get(service)
        if provider is None:
            provider = TracerProvider(resource=Resource.create({'service.name': service}))
            provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint.rstrip('/') + '/v1/traces')))
            PROVIDERS[service] = provider
        # Query strings, headers and bodies are deliberately not captured.
        FastAPIInstrumentor.instrument_app(app, tracer_provider=provider, excluded_urls='health,metrics')
        if not HTTPXClientInstrumentor().is_instrumented_by_opentelemetry:
            HTTPXClientInstrumentor().instrument(tracer_provider=provider)

    @app.get('/metrics', include_in_schema=False)
    def metrics():
        update_business_metrics(service)
        return Response(generate_latest(), headers={'Content-Type': CONTENT_TYPE_LATEST})

    @app.middleware('http')
    async def observe(request, call_next):
        start = time.monotonic()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            route = getattr(request.scope.get('route'), 'path', 'unmatched')
            if route not in ('/metrics', '/health'):
                duration = time.monotonic() - start
                REQUESTS.labels(service, request.method, route, str(status)).inc()
                LATENCY.labels(service, request.method, route).observe(duration)
                span = trace.get_current_span().get_span_context()
                record = {'service': service, 'method': request.method, 'route': route,
                    'status': status, 'duration_ms': round(duration * 1000, 3),
                    'trace_id': format(span.trace_id, '032x'), 'span_id': format(span.span_id, '016x')}
                LOG.warning(json.dumps(record))
                from starlette.concurrency import run_in_threadpool
                await run_in_threadpool(persist_log, service, record)


def persist_log(service, record):
    if service not in ('auth','orders','inventory','payments'):
        return
    from market_commerce.common import connection
    try:
        with connection(service) as conn:
            conn.execute('''INSERT INTO monitoring.application_logs(service_name,level,trace_id,method,path,status_code,duration_ms,message)
                VALUES(%s,'INFO',%s,%s,%s,%s,%s,'HTTP request completed')''',
                (service,record['trace_id'],record['method'],record['route'],record['status'],record['duration_ms']))
    except Exception as exc:  # noqa: BLE001 -- telemetry must not fail business requests
        LOG.error('Technical log persistence failed: %s', type(exc).__name__)


def update_business_metrics(service):
    from prometheus_client import Gauge
    if service not in ('orders', 'payments', 'inventory'):
        return
    from market_commerce.common import connection
    if not hasattr(update_business_metrics, 'gauges'):
        update_business_metrics.gauges = {
            'orders': Gauge('market_orders', 'Persisted order states', ['state']),
            'payments': Gauge('market_payments', 'Persisted payment states', ['state']),
            'inventory': Gauge('market_inventory_units', 'Current inventory units', ['kind']),
            'sagas': Gauge('market_sagas', 'Durable saga steps', ['step']),
        }
    gauges = update_business_metrics.gauges
    with connection(service) as conn:
        if service in ('orders', 'payments'):
            for row in conn.execute(f'SELECT status,count(*) AS n FROM {service}.{service} GROUP BY status').fetchall():
                gauges[service].labels(row['status']).set(row['n'])
        if service == 'orders':
            for row in conn.execute('SELECT step,count(*) AS n FROM orders.sagas GROUP BY step').fetchall():
                gauges['sagas'].labels(row['step']).set(row['n'])
        if service == 'inventory':
            row = conn.execute('SELECT coalesce(sum(quantity),0) AS physical,coalesce(sum(reserved_quantity),0) AS reserved FROM inventory.stock').fetchone()
            gauges['inventory'].labels('physical').set(row['physical'])
            gauges['inventory'].labels('reserved').set(row['reserved'])
            gauges['inventory'].labels('available').set(row['physical'] - row['reserved'])
