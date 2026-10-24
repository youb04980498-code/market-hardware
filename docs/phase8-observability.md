# Phase 8 observability

The monitoring profile adds Alertmanager, OTLP Collector, persistent Jaeger and restricted PostgreSQL/MongoDB exporters. Existing Prometheus/Grafana volumes are reused. Traefik exports on internal port 8082 and applies a 100 requests/second, burst 200 gateway limiter; Auth retains its persisted per-action limiter. JWT/session/RBAC enforcement remains at the service boundary, avoiding an unvalidated gateway claim. Commerce, Catalog and Analytics expose internal `/metrics`; the gateway does not route these paths to service metrics. MinIO uses its real cluster metrics endpoint. Kafka exporter measures broker partition offsets; Spark lag/rates come from actual Structured Streaming progress stored by Phase 6, not consumer-group offsets (Spark uses checkpoints).

Three provisioned dashboards: Platform Health (`market-platform-health`), Streaming Lakehouse (`market-streaming-lakehouse`), Commerce Operations (`market-commerce-operations`). All PromQL expressions are in tracked JSON. Missing samples display no data. Process CPU/memory cover Python processes; these are not whole-host or JVM measurements. Current Saga-step gauges are current backlog, not a fabricated lifetime compensation counter. Warehouse capacity remains exposed by Inventory REST; saturation incidents are exported as durable alert gauges.

Retention: Prometheus 15 days; Alertmanager 120 hours; Jaeger Badger spans 72 hours. Its init container only establishes ownership of the new trace volume for UID 10001. No Docker socket is mounted. Prometheus targets are internal; browser monitoring queries are proxied through staff-protected Analytics.

OpenTelemetry uses W3C context over HTTPX. Orders persist `traceparent` with the Saga; each retry/step resumes the original checkout trace. Request JSON logs contain service, templated route, status, duration, trace and span IDs. Commerce request records also enter `monitoring.application_logs` using existing insert-only grants. Bodies, cookies, auth headers and SQL parameter values are not logged. Kafka envelopes remain unchanged; Kafka trace-context propagation is not implemented. Source event IDs and correlation IDs remain available.

Verification commands:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-platform.ps1
.\.venv\Scripts\python.exe -m pytest tests/integration/test_phase8.py -k 'monitoring or trace' -q
docker compose exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
```

Sources: [OpenTelemetry Python instrumentation](https://opentelemetry.io/docs/languages/python/instrumentation/) and [Prometheus alerting overview](https://prometheus.io/docs/alerting/latest/overview/). Live evidence and limitations are recorded in phase8-final-report.md.
