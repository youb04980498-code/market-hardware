# Phase 8 final local execution report

Verified on 2026-10-24 against retained Docker services. **403 distinct checks have passing latest executions, with zero outstanding test failures or skips.** This result combines full suites with focused retries after corrections; it is not an uninterrupted all-green full run. Original failing JUnit reports remain in ignored `.local/`.

## A. Implementation summary

Phases 1-6 already supplied persistent databases/PIM, published GraphQL catalogue, Auth/Inventory/Orders/Payments, durable Sagas/outboxes, React administration/storefront and Spark/Delta analytics. Phase 8 adds real metrics/traces, three provisioned dashboards, infrastructure alerts, persisted business alert lifecycle, capacity/classification views, daily operations, circuit breakers/bulkheads, technical-log retention, four-zone governance and isolated recovery tooling. Versioned migrations 011-014 and analytics 003-004 are additive. Source fixtures and the V3 specification are unchanged; all 27 tracked CSV/JSON/JSONL requirement/source candidates compared equal after Git line-ending normalization. No volume, checkpoint or Kafka offset was reset. Commercial history and financial semantics remain intact.

## B. EFREI compliance matrix

The [requirement-by-requirement matrix](phase8-compliance-matrix.md) covers SQL/NoSQL, Lake/Lakehouse, platform/APIs and real-time processing, with repository evidence and final statuses. VERIFIED is bounded to the actual local checks; PARTIAL, DEFERRED and POSTPONED items remain visible. This is not a claim that all V3 obligations are complete.

## C. Observability

All 34 Compose services were running; 23 have passing Docker health checks, while the others are checked through endpoints/scrapes or worker evidence rather than invented Docker health states. All 12 configured Prometheus targets were up in the final readiness check: six APIs, Kafka exporter, PostgreSQL exporter, MongoDB exporter, MinIO, Traefik and Prometheus. Three Grafana dashboards were retrieved through the actual Grafana API. Promtool validated configuration and eight alert rules. SDK/Collector/Jaeger captured actual Orders/Inventory/Payments checkout spans; Saga propagation crosses durable steps. HTTP metrics use templated routes and bounded labels. Structured request logs include trace IDs; persisted correlated-log counts are in the final audit. Missing samples render unavailable. CPU/memory panels concern available process measurements, not a whole-host/JVM claim. Local Jaeger retains traces for 72 hours, Prometheus for 15 days.

## D. Real-time alerts

Tests produced real low stock, declined payment, 15 successful checkout events for a five-minute order spike and physical warehouse saturation. PostgreSQL stores stable alert identities, first/last observations, severity, details, state and action history. Reconciliation deduplicates identities; stock recovery resolves incidents; payment replay does not resurrect resolved incidents. API and Chromium checks exercised acknowledgement, resolution and reload persistence. A real Analytics outage fired and then cleared ServiceUnavailable. Alertmanager's receiver is local; external delivery is not configured. Abandoned carts remain conditionally deferred because durable server cart events do not exist.

## E. Logistics

Warehouse classification is OPERATIONAL/TEST/ARCHIVED. Existing business capacity values remain unchanged. Default staff summaries, analytics inventory and administration stock views exclude test/archive stock; explicit toggles include it. Available stock is physical minus reserved. Capacity means physical item units; zero capacity yields unavailable utilization. The isolated test observed 10/10 units (100%, alert active), then 4/10 and 6/10 (60%, saturation resolved); low stock at four resolved on replenishment to six. Test stock and financial history are retained.

## F. Resilience

The complete commerce suite passed 46 tests in 278.526 seconds, including concurrency, actual Saga process crashes, compensation and Kafka outage/acknowledgement recovery. Analytics tests exercise dependency loss and checkpoint recovery. Phase 8 stopped Analytics API/worker while storefront/catalogue and a genuine checkout stayed functional, observed infrastructure alert firing/recovery and retained alert state. Circuit unit checks cover CLOSED/OPEN/HALF_OPEN, failed probe and nonblocking bulkhead overflow. Defaults: five failures, 15-second cooldown, one half-open probe and eight concurrent requests per dependency/process. These are process-local controls; durable business retry state stays in SQL. Exact detection RTO and production load capacity were not benchmarked.

## G. Lakehouse

Raw Kafka/source snapshots -> normalized Staging -> validated Curated Delta entities -> Consumption aggregates/serving releases. The [data catalogue](phase8-data-catalogue.md) records ownership, schemas, lineage, sensitivity, quality, refresh and retention. Customer references are keyed 64-hex pseudonyms before Staging; no original customer ID/email was found in tested Staging entities. The [isolated Spark check](evidence/phase8-lakehouse.json) read 44 retained Delta versions, selected version 0, materialized 172 rows into a unique recovery prefix and compared full rows in both directions. It verified four zones, checkpointed window/dedup recovery and one dropped late event.

Order spikes use five-minute event-time windows, a ten-minute watermark, validated order.created envelopes and event-ID deduplication. Baseline five orders/window, factor three and minimum ten currently produce a threshold of 15. The new query has its own retained checkpoint; the original ingestion checkpoint is preserved. Transport remains at least once; sinks use durable identity/idempotence, and operational deduplication is bounded by watermark state. Historical quality-test quarantine/late/duplicate counts are retained and must not be relabelled zero.

## H. Database compliance

The live database contains exactly auth/orders/inventory/payments plus monitoring. SQL/NoSQL integrity, seed replay, financial/stock checks and source-preservation tests passed. [Query-plan evidence](evidence/phase8-query-plans.json) includes real PostgreSQL EXPLAIN ANALYZE/BUFFERS, Mongo execution stats and a session-local before/after index comparison (0.148ms vs 0.045ms in that sample). Small-data sequential scans are legitimate; these timings are not production performance guarantees. Existing OLTP tables were not destructively repartitioned; the future partitioning strategy is documented in ADR0007.

Four isolated restores passed in **173.359 seconds** ([sanitized evidence](evidence/phase8-backup-summary.json)): PostgreSQL per-table counts from an exported consistent snapshot, all 43 Mongo product documents, 43 Neo4j nodes/163 relationships and SHA256 verification of 3,702 MinIO objects (33,051,181 bytes). Original volumes stayed untouched. Neo4j recovery is a logical graph reconstruction/count rehearsal, not a complete engine security/constraint restore. PIM database/configuration was privately backed up; full PIM restoration was not rehearsed. MinIO backup while writers run is not cross-store atomic; the runbook gives a coordinated pause procedure.

## I. Security and CI

Active JWT/session checks and customer/staff/admin RBAC remain enforced behind Traefik. Stored operator maps to API staff. New operational endpoints reject unauthenticated and customer access. SQL service credentials are schema-restricted; exporters and retention have separate minimal grants. The retention account can invoke the seven-day technical-log purge, with no business DELETE grant. Weekly scheduling is checked hourly. Retention-aware seed replay cannot resurrect expired technical fixture logs.

Neo4j Community does not provide Enterprise database RBAC; an enforced separate read-only graph role is not claimed. Existing graph access remains fixed/parameterized. Public catalogue reads remain intentionally public. Gateway rate limiting is configured; saturated-load behavior was not benchmarked. Local HTTP/TLS, production hardening and full cross-store authorization audit remain limitations.

Local Ruff, pip dependency compatibility, OpenAPI export comparisons, Compose validation, PowerShell parsing, Promtool, frontend lint/type/build, npm audit (zero vulnerabilities) and tracked-candidate secret scan passed. The GitHub workflow implements repeatable local-equivalent checks; **remote CI has not run**. Private .env, access notes, JUnit logs and backups remain ignored. No credentials are included in evidence.

## J. Regression results

Distinct latest outcomes: 220 Python units +31 Phase2 +18 Phase3 +46 commerce +29 analytics +10 operations +23 frontend units +26 Chromium = **403 passed; zero latest failures/errors/skips**. Deduplication uses JUnit classname and testcase name. [Machine-readable run results](evidence/phase8-test-results.json) preserve initial failures and exact JUnit suite durations. Durations below describe each execution, not the sum of distinct checks.

| Local JUnit report | Checks | Failures/errors | Skips | Seconds |
|---|---:|---:|---:|---:|
| commerce-regressions.xml | 269 | 1 | 0 | 120.205 |
| phase8-unit.xml | 220 | 0 | 0 | 3.579 |
| phase8-base-correction.xml | 1 | 0 | 0 | 18.775 |
| phase8-retention-schema.xml | 1 | 0 | 0 | 2.600 |
| phase8-regression-commerce.xml | 46 | 0 | 0 | 278.526 |
| phase8-regression-analytics.xml | 29 | 1 | 0 | 1415.208 |
| phase8-analytics-correction.xml | 1 | 0 | 0 | 226.393 |
| phase8-acceptance.xml | 10 | 1 | 0 | 351.390 |
| phase8-role-correction.xml | 1 | 0 | 0 | 4.766 |
| frontend-unit.xml | 23 | 0 | 0 | 0.834 |
| frontend-e2e.xml | 26 | 6 | 0 | 231.317 |
| phase8-browser-correction.xml | 6 | 5 | 0 | 135.873 |
| phase8-browser-final-correction.xml | 5 | 0 | 0 | 17.603 |

Corrections: a source fingerprint could not encode Decimal technical-log durations; exact string canonicalization fixed it. Weekly purge also exposed old technical fixtures being reinserted; replay now respects completed retention. A long analytics suite exceeded the login token's lifetime; per-test login fixed the test without changing production expiry. An operations assertion expected stored operator instead of the API's documented staff role. Browser positional selectors were scoped to labelled catalogue/service cards after daily KPI insertion, and the alert select received an explicit accessible name. A focused retry also corrected a Windows shell encoding issue in that accessible label. All affected checks passed on their final execution. Early deployment timing and catalogue metrics dependency errors were corrected before these runs; the catalogue dependency guard has a unit regression. No financial/integrity assertion was removed.

Chromium/axe verified the preserved French interface, alert lifecycle and operations at 375/1440; existing administration screenshots passed 375/768/1024/1440. Screenshots and private raw JUnit files remain local. The final frontend image was rebuilt and running healthy before the successful corrections.

## K. Remaining gaps and limits

- Remote CI execution, production TLS/scale, external alert delivery, whole-host/JVM resource coverage and Kafka trace-context propagation are unverified/unimplemented.
- Neo4j Community database-level least privilege, full PIM restore and invoice PDF recovery are not claimed.
- Physical repartitioning/replication is documented future work, not an executed migration.
- V3 invoice generation/notifications and Phase7 AI/solver remain outstanding; AI was explicitly postponed. Abandoned carts remain conditional/deferred.
- This is a defensible local Phase8 operations increment, not blanket acceptance of every V3 requirement. Measured backup timing is not a guaranteed production RTO/RPO.

## L. Git and reproducibility

Implementation is committed locally after the final secret/diff review; obtain the exact commit using `git log -1 --oneline`. No remote push or remote CI success is claimed. See the [jury runbook](phase8-jury-demo.md), [backup runbook](phase8-backup-recovery.md), and `scripts/start-platform.ps1`, `verify-platform.ps1`, `test-platform.ps1`. Run from C:\market-hardware with the retained ignored local .env. Startup migrates/configures additively and does not reseed business data.

Final live audit: [phase8-verification.json](evidence/phase8-verification.json). Zero incomplete Sagas, zero pending outboxes, zero unresolved PIM sync jobs, 42 active/43 retained products, 43 graph nodes/163 relationships and all 22 disabled fixtures still disabled. Reconciliation is PASS with every reported difference zero. Pipeline metrics retain their measured timestamps; transient lag/freshness is reported honestly rather than forced to zero.
