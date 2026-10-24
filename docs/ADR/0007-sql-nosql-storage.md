# ADR 0007: SQL and NoSQL storage and recovery strategy

Status: accepted, 2026-10-24. Documents existing choices; no engine migration.

PostgreSQL owns transactional commercial state because atomic stock reservations, constraints, immutable money snapshots and durable outboxes require local ACID guarantees. A schema/restricted login per service preserves ownership. MySQL could supply comparable local ACID, but switching would not improve this working implementation; Cassandra's eventual consistency would require additional stock-serialization machinery. Scale first with targeted indexes, bounded query plans and operational monitoring; read replicas are a future option, not claimed as installed.

MongoDB owns the published product read projection: typed technical attributes differ by category, while a JSON validator and stable product_id/SKU indexes provide required consistency. A single normalized SQL attribute-value catalogue would increase joins; unrestricted schemaless writes would sacrifice validated publication. UnoPim remains authoring authority; MongoDB is a versioned projection.

Neo4j owns validated technical compatibility edges and provenance, rather than inventory or price authority. SQL adjacency tables would work but make multi-hop technical graph retrieval less direct. Graph documents are reconstructed only from stored verified properties/relationships; no speculative edge is invented.

MinIO and Delta/Parquet own analytical versions, checkpoints and immutable releases. Local object storage supplies S3 semantics and durable demonstration history; an unversioned CSV folder would not provide transactional Delta reads. The local single-driver writer lock is intentional; multi-writer S3 coordination is not claimed.

Current data does not justify destructively repartitioning populated business tables. Time-based partitioning is recommended for future large technical logs, preserving a default/catch-all partition and explicit weekly retention; current indexes cover the bounded local volume. Quarterly reports are logical cohort aggregates, not a claim of physical OLTP partitions. Read-only EXPLAIN evidence and an isolated before/after index comparison are in docs/evidence/phase8-query-plans.json.

Recovery uses consistent PostgreSQL dump/count verification, Mongo archives/document comparison, graph export/isolated reconstruction and MinIO object checksums. Existing live volumes and checkpoints are never overwritten. Trade-off: object-store backup while the writer is active is not an atomic cross-platform snapshot; coordinate a writer pause for disaster recovery. Results are in phase8-backup-recovery.md.

Neo4j Community does not provide Enterprise role-based database privileges. The existing Neo4j account is retained and application graph reads remain fixed and parameterized; a separate enforced read-only Neo4j role is not claimed. See [Neo4j authentication and authorization](https://neo4j.com/docs/operations-manual/current/authentication-authorization/).
