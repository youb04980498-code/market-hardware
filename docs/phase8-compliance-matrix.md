# Phase 8 EFREI compliance matrix

Audit date: 2026-10-24. Sources: [EFREI assignment](EFREI-assignment.md), [V3 specification](MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md), Phase8 request. Historical Phase6 reports are not current verification. Four business schemas, existing financial semantics, live volumes, source fixtures, Kafka offsets and original Spark checkpoints are preserved. Initial grouped audit found monitoring self-scrape, no provisioned dashboards/tracing, no durable alerts and no stateful order-spike query; these were implemented additively.

Each row separates repository evidence from the measured final outcome. VERIFIED means the listed local evidence passed; PARTIAL preserves the stated limitation. Detailed run counts, failures, durations and known limitations are in [execution report](phase8-final-report.md).

## A: SQL and NoSQL

| Requirement | Current state at audit | Evidence | Final verification / scope | Final status |
|---|---|---|---|---|
| Relational store: PostgreSQL | PARTIAL | data/postgres/schema/migrations; test_phase2.py | Live schema/integrity tests | VERIFIED: tests and evidence in final report |
| NoSQL: MongoDB and Neo4j | PARTIAL | data/mongodb/schema; data/neo4j; test_phase2.py | Live validators, IDs and graph tests | VERIFIED: tests and evidence in final report |
| Exactly four business schemas and monitoring technical schema | PARTIAL | 001_business_tables.sql; AGENTS.md | Schema inventory and role checks | VERIFIED: tests and evidence in final report |
| Primary/foreign keys, checks and atomic transactions | PARTIAL | 001/002 migrations; tests/integration/test_phase2.py | Constraint rejection and transaction tests | VERIFIED: tests and evidence in final report |
| Unique IDs, indexes and query optimization | PARTIAL | docs/evidence/phase8-query-plans.json | Actual PostgreSQL/Mongo execution plans | VERIFIED: tests and evidence in final report |
| Before/after indexing evidence | PARTIAL | scripts/check-query-plans.py | Session-local table before/after; live indexes untouched | VERIFIED: tests and evidence in final report |
| Partitioning strategy | PARTIAL | ADR0007; phase8-backup-recovery.md | Document bounded scale and future range partitions; no destructive repartition | PARTIAL: documented strategy; no physical repartition/replication |
| Per-service ownership | PARTIAL | 003_service_permissions.sql; common.connection | Restricted runtime grants | PARTIAL: SQL/Mongo grants verified; Neo4j Community caveat below |
| Least-privilege API / exporter / retention roles | MISSING | scripts/configure-operations.py; 012_trace_context.sql | Role/privilege tests | PARTIAL: SQL/Mongo verified; Neo4j Community caveat below |
| Persistent volumes | PARTIAL | docker-compose.yml | Live mounts/health verification | VERIFIED: tests and evidence in final report |
| PostgreSQL backup and isolated restore | PARTIAL | scripts/backup-platform.py; local report | Every dumped table count compared in isolated database | VERIFIED: tests and evidence in final report |
| MongoDB backup and isolated restore | PARTIAL | scripts/backup-platform.py; local report | 43 complete product documents compared | VERIFIED: tests and evidence in final report |
| Neo4j backup and isolated restore | PARTIAL | scripts/backup-platform.py; local report | 43 nodes / 163 edges in isolated stopped container | VERIFIED: tests and evidence in final report |
| MinIO backup and isolated restore | PARTIAL | scripts/backup-platform.py; local report | 3702 object SHA256 comparisons | VERIFIED: tests and evidence in final report |
| PIM configuration/database backup | PARTIAL | private local backup directory | Executed export; full PIM restore not rehearsed | PARTIAL: export verified; full PIM restore unverified |
| Engine trade-offs in ADRs | PARTIAL | ADR0007; ADR0002 | Inspect alternatives, ownership and recovery rationale | VERIFIED: tests and evidence in final report |

## B: Lake and Lakehouse

| Requirement | Current state at audit | Evidence | Final verification / scope | Final status |
|---|---|---|---|---|
| MinIO object storage | PARTIAL | docker-compose.yml; config.s3 | Authenticated object read and restore | VERIFIED: tests and evidence in final report |
| Persisted Raw zone | PARTIAL | raw/kafka_events; raw/source_snapshots | Live Delta inspection | VERIFIED: tests and evidence in final report |
| Persisted normalized Staging zone | MISSING | pipeline.refresh; staging/<entity> | Read actual staging Delta tables | VERIFIED: tests and evidence in final report |
| Curated Delta entities/events | PARTIAL | pipeline.py; worker.ingest | Read keys and valid-event identities | VERIFIED: tests and evidence in final report |
| Consumption reports and serving manifests | PARTIAL | pipeline.publish; serving.current | Committed release and zero reconciliation differences | VERIFIED: tests and evidence in final report |
| Batch ingestion and quarterly Spark processing | PARTIAL | pipeline.quarterly; test_phase6.py | Multi-quarter and replay tests | VERIFIED: tests and evidence in final report |
| Spark streaming ingestion | PARTIAL | worker.py | Observe real Kafka batches | VERIFIED: tests and evidence in final report |
| Columnar transactional format | PARTIAL | spark.py; Delta history | Actual Parquet/Delta logs | VERIFIED: tests and evidence in final report |
| Delta version history | PARTIAL | scripts/check-lakehouse-operations.py | Read live history | VERIFIED: tests and evidence in final report |
| Versioned reads / time travel | PARTIAL | scripts/check-lakehouse-operations.py | Read retained historical version | VERIFIED: tests and evidence in final report |
| Safe isolated version restoration | PARTIAL | scripts/check-lakehouse-operations.py | Write isolated recovery prefix; compare full rows | VERIFIED: tests and evidence in final report |
| Validation and quality | PARTIAL | source.capture; events.parse_record; test_phase6.py | Money, keys, quantities, schemas and versions | VERIFIED: tests and evidence in final report |
| Quarantine | PARTIAL | staging/invalid_events | Malformed/version/conflict tests | VERIFIED: tests and evidence in final report |
| Data catalogue: source/owner/schema/sensitivity/refresh/quality/retention | MISSING | phase8-data-catalogue.md | Dataset inventory and runtime observed_at metadata | VERIFIED: tests and evidence in final report |
| Lineage across four zones | PARTIAL | phase8-data-catalogue.md; ADR0005 | Explicit source -> Delta -> serving mapping | VERIFIED: tests and evidence in final report |
| Customer pseudonymization before Staging | PARTIAL | source.customer_key; capture | No email/customer_id in staging; keyed 64-hex references | VERIFIED: tests and evidence in final report |
| Retention and privacy boundaries | MISSING | phase8-data-catalogue.md; phase8-resilience.md | Commercial history retained; logs separate | VERIFIED: tests and evidence in final report |

## C: Platform and APIs

| Requirement | Current state at audit | Evidence | Final verification / scope | Final status |
|---|---|---|---|---|
| At least three autonomous microservices | PARTIAL | Auth, Orders, Inventory, Payments, Catalog, Analytics | Real gateway/checkout regression | VERIFIED: tests and evidence in final report |
| REST API | PARTIAL | market_commerce/*; market_analytics/api.py | Live HTTP tests | VERIFIED: tests and evidence in final report |
| GraphQL API | PARTIAL | market_catalog/api.py; schema contract | Filtered catalogue, negatives and concurrency | VERIFIED: tests and evidence in final report |
| Versioned OpenAPI contracts | PARTIAL | data/contracts/openapi/*.v1.json; check-contracts.py | Regenerate and compare; existing URL contracts preserved | VERIFIED: tests and evidence in final report |
| Gateway routing and rate limiting | PARTIAL | infrastructure/traefik/catalog.yml | Live routes; configured 100/sec burst200 limiter | PARTIAL: live routes; limiter configured; load saturation unmeasured |
| JWT authentication and expiration | PARTIAL | auth.py; common.decode_access | Unauthorized/expired/revoked sessions | VERIFIED: tests and evidence in final report |
| RBAC with at least three roles | PARTIAL | customer/operator (API staff)/admin | Forbidden and operator/admin boundaries | VERIFIED: tests and evidence in final report |
| Ownership enforcement | PARTIAL | orders.py; payments.py; inventory.py | Other-user access denied | VERIFIED: tests and evidence in final report |
| Authentication request rate limits | PARTIAL | auth.py persisted action limiter | Phase4 auth checks | VERIFIED: tests and evidence in final report |
| Timeouts | PARTIAL | common.remote | Explicit connect/read bounds | VERIFIED: tests and evidence in final report |
| Bounded durable retries | PARTIAL | saga.py; outbox.py | Recovery and attempt-history tests | VERIFIED: tests and evidence in final report |
| Circuit breaker CLOSED/OPEN/HALF_OPEN/recovery | MISSING | resilience.Circuit; test_resilience.py | Unit transition/probe tests | VERIFIED: tests and evidence in final report |
| Bulkhead isolation | MISSING | resilience.Circuit.pool | Saturated dependency rejected without blocking | VERIFIED: tests and evidence in final report |
| Saga success and compensation | PARTIAL | saga.py; test_phase4.py | Success, decline, release, refund, crash recovery | VERIFIED: tests and evidence in final report |
| Checkout/payment/import idempotency | PARTIAL | test_phase2/3/4.py | Replay and concurrency checks | VERIFIED: tests and evidence in final report |
| Prometheus real metrics | PARTIAL | telemetry.py; metrics.py; exporters | All configured targets scraped, no invented samples | VERIFIED: tests and evidence in final report |
| Grafana provisioned dashboards | MISSING | infrastructure/grafana | Three real datasource/panel dashboard APIs | VERIFIED: tests and evidence in final report |
| OpenTelemetry Collector and tracing backend | MISSING | otel/collector.yml; Jaeger | Real checkout trace spans across three services | VERIFIED: tests and evidence in final report |
| Structured logs with trace correlation | MISSING | telemetry.py; monitoring.application_logs | JSON and persisted nonzero trace IDs | VERIFIED: tests and evidence in final report |
| Technical-log weekly retention | MISSING | 012 migration; log_retention.py | Old test log removed, recent retained; no business DELETE grant | VERIFIED: tests and evidence in final report |
| Infrastructure alerting | PARTIAL | prometheus/rules.yml; Alertmanager | Actual service-down alert and recovery | VERIFIED: tests and evidence in final report |
| Analytics outage isolation | PARTIAL | test_phase8.py recovery test | Storefront/catalogue/checkout run while Analytics stopped | VERIFIED: tests and evidence in final report |
| CI unit/lint/type/contracts/Compose/secrets/dependencies | MISSING | github/workflows/ci.yml | Local equivalents; remote CI not claimed | PARTIAL: local checks passed; remote CI unverified |
| One-command non-reseeding startup/verification | PARTIAL | start-platform.ps1; verify-platform.ps1 | Actual Windows execution and readiness | VERIFIED: startup and final readiness executed; Windows reload adjustment checked separately |
| Secrets / least privilege | PARTIAL | check-secrets.py; role tests | No local secret in tracked candidates; restricted grants | VERIFIED: tests and evidence in final report |
| Existing French responsive accessible admin design | PARTIAL | Today/Warehouses/Observability.tsx | Live Chromium/axe at 375 and1440; existing regressions | VERIFIED: tests and evidence in final report |

## D: Real-time processing

| Requirement | Current state at audit | Evidence | Final verification / scope | Final status |
|---|---|---|---|---|
| Kafka ingestion | PARTIAL | outbox.py; worker.py | Real broker acknowledgements and retained transport records | VERIFIED: tests and evidence in final report |
| Spark Structured Streaming | PARTIAL | worker.py | Running ingestion and operational query | VERIFIED: tests and evidence in final report |
| Event-time five-minute windows | PARTIAL | alerts.windowed_orders | Genuine checkout-driven order spike | VERIFIED: tests and evidence in final report |
| Ten-minute watermark | MISSING | alerts.windowed_orders | Late-row exclusion test in isolated state | VERIFIED: tests and evidence in final report |
| Checkpointed stateful processing | MISSING | checkpoints/order_spikes_v1 | Dedup/window state survives restart | VERIFIED: tests and evidence in final report |
| Checkpoint recovery of original ingestion | PARTIAL | checkpoints/kafka_ingestion_v1; test_phase6.py | Controlled worker/dependency interruption | VERIFIED: tests and evidence in final report |
| Duplicate event handling | PARTIAL | events/business identity; watermark UUID dedup | Raw transport distinct; logical event counted once | VERIFIED: tests and evidence in final report |
| Defined guarantees | PARTIAL | phase8-alerting.md; ADR0006 | At-least-once transport, idempotent logical effects; bounded operational dedup | VERIFIED: tests and evidence in final report |
| Low-stock persistent alerts | MISSING | alerts.reconcile | Actual isolated inventory adjustment and replenishment | VERIFIED: tests and evidence in final report |
| Payment-failure alerts | MISSING | alerts.reconcile | Genuine failed payment and Saga compensation | VERIFIED: tests and evidence in final report |
| Order-spike alert with declared baseline/minimum | MISSING | alerts.spikes | 15 actual checkouts and persistent event-time alert | VERIFIED: tests and evidence in final report |
| Warehouse saturation >90% | PARTIAL | alerts.reconcile; Inventory warehouse summary | Known physical capacity; actual 100% and60% observations | VERIFIED: tests and evidence in final report |
| Unknown capacity unavailable | PARTIAL | inventory.warehouse_summary; Warehouses.tsx | Null utilization for zero capacity | VERIFIED: tests and evidence in final report |
| Alert dedup / acknowledgement / resolution / persistence | PARTIAL | operational_alerts / alert_actions | API lifecycle and browser reload tests | VERIFIED: tests and evidence in final report |
| Consumer lag | PARTIAL | worker.measure_lag; kafka-exporter | Actual checkpoint processed end offsets vs broker end offsets | VERIFIED: tests and evidence in final report |
| Throughput / Spark progress / failures / freshness | PARTIAL | metrics.py; Grafana | Actual progress/outcome metrics; absent samples unavailable | VERIFIED: tests and evidence in final report |
| Controlled failure demonstration | PARTIAL | phase8-jury-demo.md; recovery tests | Service outage, Kafka/Spark replay and restoration | VERIFIED: tests and evidence in final report |
| Abandoned carts | PARTIAL | No reliable durable cart events | DEFERRED by explicit conditional scope | DEFERRED |
| Phase7 AI / recommendations | PARTIAL | Existing unchanged placeholder | POSTPONED by user; no fabricated compatibility output | POSTPONED |

## Preserved limitations and architecture exceptions

- Public published catalogue reads remain public; authoring is protected in UnoPim. Commerce and operational endpoints require active JWT sessions and roles. Authentication is enforced by services behind the gateway; Traefik does routing/rate limits, not a duplicated custom JWT verifier. Existing REST URLs are preserved; OpenAPI/event contracts carry explicit versions.
- Analytics read-only source export is the explicit ADR0005 exception to cross-service direct reads. No business API gains cross-schema access; only exported snapshots are joined by Spark.
- Physical OLTP repartitioning/replication is not claimed for the bounded local dataset; the safe scaling/partition strategy and measured index plans are documented. Restore tests use isolated targets.
- Invoice PDFs/notifications and the postponed AI solver remain V3 obligations outside this implemented EFREI technical increment. A full V3 acceptance claim, including invoice restoration, must not be inferred.
- Kafka context propagation, whole-host/JVM CPU metrics and external paging are not claimed. Real available process/HTTP/stream/database metrics are shown; missing metrics stay unavailable.
- Remote CI and production TLS/scale are unverified. This remains a local HTTP Docker platform.

Neo4j Community does not provide Enterprise role-based database privileges. The existing Neo4j account is retained and application graph reads remain fixed and parameterized; a separate enforced read-only Neo4j role is not claimed. See [Neo4j authentication and authorization](https://neo4j.com/docs/operations-manual/current/authentication-authorization/).
