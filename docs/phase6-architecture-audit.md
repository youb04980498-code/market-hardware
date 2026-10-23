# Phase 6 architecture audit

Audited 2026-10-23, before implementation. Phase 5 commit: dcd6a50. Working tree clean. Existing JUnit reports contain 231 backend regressions, 45 commerce checks, 23 frontend checks and 15 browser checks, all passing. These are reported baseline evidence; the suites must be rerun for Phase 6 acceptance.

## Actual capabilities

- PostgreSQL market_db has four business schemas and monitoring. Existing immutable migrations 001–010 own business invariants. No analytics tables exist. Existing APIs have restricted credentials.
- Kafka 4.1.2 and its existing persistent volume are running. Topics are market.auth.v1, market.orders.v1, market.inventory.v1 and market.payments.v1. The existing publisher emits schema version 1 JSON envelopes, keys by aggregate_id, uses acks=all and marks SQL publication only after delivery callback acknowledgement. A crash between Kafka acknowledgement and SQL marking may redeliver event_id.
- Historical event payloads are intentionally sparse. For example an order cancellation may contain only order_id and reason; old payment events contain payment/order IDs and amount. New trigger events contain fuller row snapshots. Events do not consistently carry frozen order lines, complete refund balances or historical stock quantities. They cannot reconstruct authoritative financial history alone.
- Payment states include SUCCEEDED and REFUNDED. Successful captures are represented once per payment ID. Historical REFUNDED payments have no corresponding modern refund records; live refund rows and financial_audit are available. Historical refund occurrence timestamps cannot be invented. Reports will explicitly use payment-creation cohorts with latest known refunds, not fabricate historical cash-flow timestamps.
- Actual Neo4j relationship type is COMPATIBLE, with 163 RULE_VALIDATED edges (COMPATIBLE_WITH is conceptual, not the stored type). MongoDB has 42 active published products. No graph/catalogue writes are needed.
- MinIO uses the existing pinned local image and miniodata volume. Its S3 endpoint works with authenticated boto3. No buckets existed at audit. Analytics will add a private bucket without changing other buckets or volumes.
- PySpark 3.5.7 and delta-spark 3.3.2 are already pinned as development dependencies; PySpark bundles Hadoop client 3.3.4. No Spark service, streaming checkpoint, Delta table or executable analytics job exists. pipelines/* and services/analytics contain only .gitkeep.
- The React application has a real Auth provider, relative typed clients, role guards, a five-group admin layout and an Analytics placeholder. It must be extended in place.
- Docker has about 7.6 GiB RAM and 12 CPUs available. Existing services use approximately 4 GiB. One bounded local Spark driver is appropriate; a new cluster/master/worker fleet is unnecessary.

## Selected design

Use one optional analytics profile: one Spark driver local[2] (batch and streaming runtime), and a lightweight read-only Analytics FastAPI. Reuse Kafka, PostgreSQL, MinIO, Traefik and the existing frontend. Pin compatible Spark 3.5.7 / Delta 3.3.2 / Scala 2.12 / Hadoop-S3A 3.3.4 dependencies with Java 17 and Python 3.12. Delta's compatibility table explicitly supports Delta 3.3.x with Spark 3.5.x; actual jar compatibility still requires execution.

Bronze retains Kafka transport coordinates, original payload, parsed envelope metadata and validation/quarantine status. Business duplicates are identified by event_id; missing/invalid IDs retain topic/partition/offset transport identity. All late events remain auditable; no watermark drops financial history.

Because events are incomplete, micro-batches are change notifications and durable audit inputs. A column-restricted, read-only repeatable-read PostgreSQL snapshot reconciles authoritative entities periodically and after ingestion. Each snapshot has a cutoff and content identity. Silver records are typed snapshots, never invented historical events. Joins and calculations happen only in the analytical Spark process, not in business services or source SQL joins. Frozen line amounts are authoritative; current GraphQL categories, where used, are explicitly labelled current classification.

Delta on private MinIO remains the durable source. Spark computes Gold from Silver and persists Gold before publishing an atomic versioned serving release. A separate market_analytics database in the existing PostgreSQL container avoids introducing a fifth business schema in market_db. The serving API role cannot access market_db or mutate serving releases; the snapshot reader has only the documented source columns. This is a projection, not a substitute lakehouse. HTTP never starts Spark work.

A PostgreSQL session advisory lock fences the single writer across streaming/manual batch jobs. No SQL transaction or business row lock is held while Spark/MinIO work runs. Delta S3 single-driver log semantics require this policy: arbitrary independent concurrent writers are unsupported. Checkpoints are durable and are never deleted/reset during normal execution. Kafka retention gaps fail visibly; existing topic offsets are never reset.

## Risks and acceptance work

Validate actual S3A/MinIO commits and read-after-write, restart/replay, duplicates, corrupt/unknown-version records, out-of-order events, interrupted projection publication, missing Kafka/MinIO, late refunds and repeated backfill/quarterly runs. Assert actual source/Silver/Gold/API reconciliation and document freshness. Preserve the original datasets and catalogue/graph fingerprints. Keep Analytics failures isolated from checkout. UI acceptance requires real values, loading/error/stale states, filters, responsive screenshots and accessibility checks.

Sources: https://docs.delta.io/releases/ ; https://docs.delta.io/delta-storage/ ; https://spark.apache.org/docs/3.5.7/structured-streaming-kafka-integration.html ; https://hadoop.apache.org/docs/current/hadoop-aws/tools/hadoop-aws/third_party_stores.html .
