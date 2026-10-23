# Phase 2: database schemas and seed data

Run from C:\market-hardware with Docker Desktop running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\initialize-data.ps1
# Repeat live validation independently:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-data.ps1
```

The initializer verifies healthy containers and authenticated connections, applies migrations, imports the tracked data/ directory (no ZIP), and runs live integration tests. It reads the ignored .env directly and adds missing generated service passwords there, preserving existing values. .env.example is only a secret-free repository template.

## Definitions and access

PostgreSQL market_db has four business schemas (auth, orders, inventory, payments) and the technical monitoring schema. Versioned SQL files under data/postgres/schema/migrations implement tables, indexes, constraints, lifecycle checks, stock reservation accounting, transactional outboxes and audits. monitoring.schema_migrations records SHA256 checksums; add a new migration rather than changing an applied file.

Each service has a distinct restricted login with its own schema access and log insertion rights. Service roles cannot directly read other business schemas. Cross-service identifiers intentionally have no cross-schema foreign keys. Administrative import validation checks their consistency; future APIs must enforce these boundaries at runtime. Public is PostgreSQL's built-in schema and is not a business schema.

MongoDB market_catalog.products uses strict collection validation and unique product_id/SKU indexes. IDs, prices and numeric technical attributes use BSON Int64, publication timestamps use BSON dates, and source metadata remains intact. Definitions are in data/mongodb/schema/.

Neo4j Product constraints and parameterized imports are in data/neo4j/schema.cypher and import_v3.cypher. Only the supplied compatibility edges are loaded. Rule versions, validation status and provenance are preserved. Nested maps are serialized JSON because Neo4j properties cannot contain maps.

## Source mapping

| Source | Stored representation |
| --- | --- |
| postgres/*.csv | Explicit typed field mappings into schema-owned tables |
| auth placeholder password hashes | Preserved disabled fixture hash; is_active=false |
| orders REFUNDED | Preserved historical status |
| monitoring/application_logs.csv service | monitoring.application_logs.service_name |
| kafka/events.jsonl version | outbox_events.event_version |
| Historical order/payment/reservation events | Corresponding schema-owned transactional outbox |
| Replay scenarios and unapplied product/stock updates | Remain source fixtures; not invented historical database changes |
| catalog/mongodb_products.json | Validated approved product projections, stable IDs and metadata |
| neo4j/product_nodes.csv, compatibility_edges.csv | Source products and compatibility relationships only |

Stock starts with zero reserved quantity on initial insert; reservation triggers materialize the source ACTIVE reservations. Existing stock is never reset. Identity sequences advance without moving backwards. Money is integer cents; timestamps are UTC.

## Repeatability and verification

Identical records are skipped; conflicting existing source records fail rather than being overwritten. PostgreSQL import runs in one transaction, with a database-owner-only snapshot mode for historical lifecycle states and exact source events. A session advisory lock serializes imports. MongoDB and Neo4j operations are repeatable, but there is no distributed transaction across the three stores: after a partial failure correct the cause and rerun. No database or collection is dropped.

Live tests cover source row counts, referential integrity, totals/payment/invoice consistency, reserved stock, reservation retries and contention, transactional outbox rollback, restricted logins, MongoDB validation/indexes, exact graph metadata and edges, cross-database product IDs, compatibility positive/negative fixtures and quarterly expectations. Two repeated imports must leave database content fingerprints unchanged. Mutation probes roll back. These tests exercise database behavior, not an implemented checkout API or full Saga.

Validated source counts: 20 customers, 72 orders, 140 order items, 67 payments, 61 invoice metadata rows, 61 notification records, 3 warehouses, 126 stock rows, 6 reservations, 22 disabled fixture users, 3 roles, 80 application logs, 42 catalog/graph products and 163 compatibility edges.

## Scope and limitations

The V3 requirements document remains unchanged. This phase does not implement frontend, AI, Kafka, Spark, application APIs, live UnoPim synchronization, PDF generation, email delivery or the scheduled log purge. Historical SENT notifications and invoice paths are fixture metadata; they do not prove delivery or PDF availability. All 80 source logs are retained. Compatibility and BIOS fixtures are synthetic and not externally vendor-certified. Product active-state and cross-service checks are exercised by import validation; future services must enforce them during requests. No source dataset generation or production password provisioning is claimed.

## Phase 3 ownership handover

After a projection is adopted by product-sync, rerunning this importer preserves its PIM-owned revision. Catalogue/graph regression checks permit later approved revisions and newly created PIM products without Inventory stock. The Phase 3 verification workflow retains one inactive test product and advances publication versions; the original source data remains unchanged. See [Phase 3](phase3-catalogue.md).
