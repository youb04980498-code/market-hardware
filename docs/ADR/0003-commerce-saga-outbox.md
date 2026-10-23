# ADR 0003: transactional commerce and durable orchestration

Status: implemented and live-verified; see docs/phase4-commerce.md for the final results and scope.

## Audit before implementation

V3 remains authoritative. Phase 2 already defines four business schemas, restricted service logins, deferred order-total checks, stock reservation triggers, lifecycle guards, financial audit triggers and schema-owned transactional outboxes. Phase 3 already supplies the approved catalogue through GraphQL. These components are reused rather than replaced.

The Phase 4 request uses staff where the existing role is operator; the API maps operator to staff without changing historical roles. Order confirmation uses the existing PAID state. Existing inventory event names are inventory.reservation_released and inventory.committed; preserve those names in the versioned contract. Kafka currently uses profile kafka, not streaming; retain kafka and add streaming as an alias. V3's integer-cent money convention is retained, with Decimal arithmetic when calculating totals. No fifth business schema or cross-service SQL join/FK will be added.

The existing order-line schema lacks SKU/title/currency/publication snapshots. New nullable/defaulted columns will preserve historical rows and record these fields for new orders. Refresh sessions, request idempotency, Saga progress, refunds, expiry and outbox delivery leases require additive tables/columns. Compensation of a captured payment may require STOCK_RESERVED -> REFUNDED, which the earlier guard did not allow; this transition will be added explicitly rather than pretending that stock finalization succeeded.

## Decision

Orders orchestrates via authenticated internal HTTP. Every step commits local progress and releases database locks before remote calls. A renewable per-step lease with conditional progress updates prevents concurrent duplicate execution; remote commands are independently idempotent. Ambiguous payment timeouts remain pending and are reconciled before retry. Captured payments are either finalized or refunded with durable retry state. Reservations cannot expire while payment is uncertain; expiry first asks Orders to atomically move a safe unpaid Saga to compensation.

The outbox publisher claims events with SKIP LOCKED, commits a delivery lease, publishes with Kafka acknowledgement, and only then marks published. No Kafka means durable pending events. A crash after acknowledgement can redeliver the same event_id: delivery is at least once, and consumers must deduplicate by event_id. A persisted verification consumer demonstrates inbox deduplication; Spark and business event consumers remain later phases.

Historical seed rows stay unchanged. Live tests use separately bootstrapped Argon2 accounts and a dedicated test warehouse, retaining test transactions for audit. No volume reset, table recreation, truncation or deletion is part of setup or verification.

Continue the existing checksum-verified SQL migration runner and psycopg transaction boundary. An ORM/schema reset is unnecessary for the already-implemented PL/pgSQL invariants. Additive structures remain compatible with the earlier code; application rollback retains all data instead of physically dropping populated financial/Saga tables.

Combined regression testing reproduced missing GraphQL fields under concurrent mixed selections (one malformed response in an 80-request probe). Inspection of pinned graphql-core 3.3.0 showed temporary FieldDetails IDs used as memoization keys; ID reuse is the inferred cause. A narrow existing-service fix collects subfields per occurrence and constructs a fresh depth-limiter extension per request. No catalogue API/data/ownership is replaced. A 160-request concurrent selection regression covers the observed failure. Phase 3 fault tests also now wait for persisted retry deadlines before invoking a warm worker container.
