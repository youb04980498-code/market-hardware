# ADR 0006: Additive operations, observability and recovery

Status: accepted, 2026-10-24.

Context: EFREI's four modules require observable services, real-time operational incidents, bounded dependency failures, governed lakehouse layers and demonstrated restores. Phase6 already owns the authoritative financial pipeline.

Decision: extend existing service instrumentation and the existing Analytics writer/API. Keep durable alerts in market_analytics, with narrow column/action grants for its otherwise read-only API role. Reconcile low-stock/payment/capacity from explicit read-only exports; use a new checkpointed event-time order-window query in the same Spark worker. Do not introduce another financial pipeline, extra market_db business schema or cross-service SQL access. Additive warehouse metadata preserves physical stock and historical references. Preserve every existing checkpoint/offset.

Prometheus uses real app metrics and standard PostgreSQL/MongoDB/Kafka exporters; Collector/Jaeger use W3C trace context. A dedicated read-only pg_monitor role supports exporter statistics. App roles retain their existing schema ownership and insert-only technical logging grants. A dedicated retention role can execute only the scoped technical purge. Saga traceparent metadata supports asynchronous continuation without putting identities/credentials in metric labels.

Alternatives: synchronously emitting alerts from checkout would couple availability and mutate financial paths; a second analytics service/database pipeline would duplicate authoritative semantics. Client-side alerts cannot survive reload or prove event-time behavior. Destructive repartitioning/resetting state would conflict with preservation constraints. A full managed cloud stack would violate local deployment.

Trade-offs: snapshot alerts have eventual delay; order-spike state is bounded by a ten-minute watermark and starts at latest once, so it is not historical backfill. Local circuit breakers are process-local; Saga retries remain durable. Alertmanager has a local receiver and no external paging. Restore demonstrations use isolated targets and count/document/checksum checks rather than overwriting working stores. Actual test results and remaining V3 obligations are reported separately; AI remains Phase7.
