# Market Hardware — V3 Synthetic Seed Dataset

**Status:** deterministic, internally validated test fixtures; not a production export.
All prices, specifications, compatibility relationships and identities are illustrative.
Vendor/BIOS/firmware support has **not** been externally verified.

## Contents

| File | Purpose |
|---|---|
| `pim/products_import.csv` | PIM mapping/staging CSV (not UnoPim native import without mapping) |
| `catalog/mongodb_products.json` | 42 MongoDB product projections with `currency`, `source_version`, `published_at`, `publication_version` |
| `neo4j/product_nodes.csv` | Full technical attributes (typed scalars and JSON-serialized complex attributes), publication and validation metadata |
| `neo4j/compatibility_edges.csv` | 163 spec-derived edges with rule version, validation status, provenance and timestamp |
| `neo4j/import.cypher` | Neo4j CSV import (requires CSV files in Neo4j import directory) |
| `postgres/*.csv` | 20 customers, 72 orders, 140 items, 67 payments, 61 invoice metadata rows, 3 warehouses, 126 stock rows, 6 reservations, 22 auth users, 3 roles, user-role assignments, notification metadata |
| `kafka/events.jsonl` | 209 events with `version` and `correlation_id`, including order, payment, inventory and product lifecycle cases |
| `scenarios/saga_scenarios.json` | Explicit failed-payment compensation and replay/idempotency scenarios |
| `ai/validated_pc_builds.json` | Four complete builds, prices, budgets |
| `ai/incompatible_examples.json` | Nine negative cases; GPU length case explicitly overrides synthetic GPU length |
| `lakehouse/quarterly_expected.csv` | Expected quarter aggregates for paid/refunded historical orders |
| `monitoring/application_logs.csv` | Retention/purge fixtures |
| `scripts/validate_dataset.py` | Cross-file consistency, graph rule predicates, positive/negative build validation |
| `.gitignore` | Example ignore policy that does **not** exclude source data |

## Run validation (from the repository root)

```bash
python data/scripts/validate_dataset.py
```

## Phase 2 automated import

Run `scripts/initialize-data.ps1` from the repository root. It applies the actual migrations, maps CSV fields and imports all three databases without copying CSVs into containers. Run `scripts/verify-data.ps1` to repeat live validation. Placeholder auth users are imported inactive. See [Phase 2 details](../docs/phase2-database-setup.md). The manual notes below describe fixture semantics; the automated runner is the supported entry point.

## Import order / notes

1. Apply your **actual** PostgreSQL V3 migrations first. These CSV files are logical fixtures,
   not a ready-made SQL migration; adjust column/status mapping as needed.
2. Import auth roles and users, customers, warehouses, stock, orders, items,
   payments, invoice metadata and reservations in dependency order.
   Auth hashes are deliberately **disabled placeholders** and cannot be used to log in.
   Create real hashed development passwords via the auth service.
3. Configure UnoPim attribute families and map `pim/products_import.csv` to the actual
   installed UnoPim importer. The CSV is not guaranteed to match native UnoPim format.
4. MongoDB and Neo4j are downstream projections of approved PIM products. Import MongoDB
   using your sync service or a compatible import utility; preserve BSON int64 as needed.
5. Copy Neo4j CSVs to Neo4j's import directory and run `neo4j/import.cypher`.
   Nested array/map specs are JSON strings in the graph and should be parsed by the
   solver when necessary; scalar attributes are loaded as numeric/text properties.
6. Kafka events are **scenario/replay fixtures**, not a transactionally consistent
   production outbox stream. `product.updated` and `inventory.stock_changed` are
   *unapplied event scenarios*, so their changes are not reflected in snapshot files.
   The failed-payment scenario is similarly independent of the historical order tables.
7. Invoice CSV contains metadata only; PDF objects do not exist until invoice worker
   generates them. Notification records are synthetic; Mailpit has not received emails.
8. Quarterly expected results treat fully refunded orders as gross sales minus full
   refunds. No partial refunds, shipping, tax or promotions are modeled.
9. Pairwise graph rules and whole-build checks are **synthetic approximations**;
   real compatibility additionally requires verified BIOS, vendor PSU connectors,
   thermal performance and mechanical fit. Check stock/prices again before checkout.
10. Only technical logs are eligible for seven-day cleanup. Do not purge transactional,
    customer, invoice or audit records with the same policy.

## Git

The repository root now tracks seed sources under data/. Runtime database storage, lakehouse checkpoints, credentials and Python caches remain ignored. The nested ignore file also protects runtime files when this dataset is used independently.

## Scope

This package closes the six reported seed-data gaps but does not deploy infrastructure,
implement APIs, validate real-world vendor specs, or execute actual Kafka/Spark/DB services.

## Executable V3 edge cases

The validator also executes ai/v3_edge_cases.json: missing critical specifications, unknown or insufficient BIOS revisions, a supported synthetic firmware case, price increases/decreases requiring a new quote, budget overflow, and stock exhaustion before checkout. These checks are offline fixture validation, not a running checkout service or a production solver. Firmware revisions are ordered synthetic integers tied to a specific CPU/motherboard pair; they do not certify vendor BIOS support. A changed price requires customer reconfirmation; an unavailable product rejects checkout. No stock is reserved by this validation.

The invoice lifecycle fixture emits invoice.ready, matching the V3 notification handoff.

## Published catalogue ownership

Phase 3 imports the PIM CSV through explicit UnoPim REST mappings and publishes approved revisions with product-sync. After adoption, Phase 2 imports preserve those revisions; source fixtures remain tracked and unchanged. See [Phase 3](../docs/phase3-catalogue.md).
