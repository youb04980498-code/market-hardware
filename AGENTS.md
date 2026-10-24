# Working in Market Hardware

## Administration design

For dashboard work, read the project-local [dashboard-design skill](.agents/skills/dashboard-design/SKILL.md) and its layout, components, tokens, snippets and QA references. Installed from abdiraimov-otabek/dashboard-design-skill (MIT). The administration overhaul is desktop-only (1280px and above), light content with navy navigation and restrained blue accents; these user requirements override generic mobile/dark-mode examples. Never seed data for visual QA: compare real API responses with rendered values. Keep storefront styling isolated. See docs/admin-overhaul.md for API boundaries and verification.

## Current state

The optional `world` profile on `3d-test-branch` exposes read-only HTTP composition and a separate Kafka-to-SSE invalidation bridge; it has no database credentials. `/admin/3d-world` shows recorded API state with explicitly synthetic placements; `/admin/3d-store` remains DEMO. Never project event payloads over authoritative API state, invent live carts without telemetry, reuse another consumer group or add business writes to this interface. See docs/3d-world.md and ADR 0008. Desktop only.

For fresh-clone setup, follow [COLD_START.md](docs/COLD_START.md). `prepare-cold-start.ps1` refuses existing Market Hardware containers/volumes; `start-platform.ps1` is the retained-state startup path and never a substitute for initial migrations, seed import and PIM provisioning. The complete empty-volume bootstrap remains unverified; do not infer cold-start success from existing service readiness.

This repository contains the project scaffold, the reference architecture, and working local infrastructure. Phase 2 implements versioned database migrations, catalog validation, graph imports, idempotent seed loading and live database integration tests. Phase 3 implements UnoPim REST configuration/import/approval, the product synchronization worker, a read-only Strawberry GraphQL catalogue and Traefik routing. Phase 4 implements Auth, Inventory, Orders, simulated Payments, persisted checkout Sagas and Kafka-acknowledged outbox publishing. Phase 5 adds one local React storefront and administration application. Phase 6 adds local Spark/Delta streaming, historical snapshot reconciliation, quarterly reports, a read-only Analytics API and the existing React analytics page. Dataset generation and AI remain to implement. Keep documentation explicit about that status.

Read `docs/MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md` before implementing a component. It is the governing functional and technical specification, including MUST requirements and acceptance criteria AC-01 through AC-27. `docs/architecture/MARKET_HARDWARE_ARCHITECTURE.md` is historical V1 context; V3 takes precedence wherever they differ. Record material architecture decisions in `docs/ADR/` and update affected contracts and documentation with the implementation.

The directory layout follows the V3 scaffold. AI services remain placeholders; Spark analytics uses the optional analytics profile; Kafka is optional under the kafka profile. The root Compose stack includes Neo4j and the upstream UnoPim services, including its dedicated PostgreSQL database, Redis, Elasticsearch, workers and Mailpit. Phase 8 adds instrumentation, provisioned monitoring/tracing, durable alerts, warehouse classification/capacity views, weekly technical-log retention and isolated restore tools. Ollama/Qwen, invoicing and notifications remain to implement. Running infrastructure does not validate the application workflows.

## Architecture conventions

- Backend: Python 3.12, FastAPI, Pydantic and psycopg with checksum-verified SQL migrations; Strawberry GraphQL for the catalog. SQLAlchemy/Alembic are available development dependencies, not the current migration runner.
- Frontend: React, TypeScript and Vite in one storefront/admin application. The current administration has six navigation groups; Recharts renders materialized Analytics data. Preserve the original feature placeholder directories.
- PostgreSQL uses one `market_db` database with exactly four business schemas: `orders`, `inventory`, `payments`, and `auth`. A technical `monitoring` schema is allowed for logs. Each service owns its schema and must use a distinct, restricted database role when implemented.
- Do not add SQL foreign keys, joins, or direct database reads across service boundaries. Catalog data belongs in MongoDB `market_catalog.products`.
- UnoPim owns product descriptions and attributes. A synchronization worker publishes approved, versioned products to MongoDB and validated compatibility relationships to Neo4j. The PIM database is separate from `market_db`; stock belongs to Inventory.
- Reuse stable numeric `product_id` values throughout PIM, MongoDB, Neo4j, SQL, events and the lakehouse. Use consistent BSON Int64 IDs and prices in MongoDB. MongoDB `_id` is not a business identifier.
- Represent money as integer cents and timestamps as UTC ISO 8601 / PostgreSQL `TIMESTAMPTZ`.
- Develop functional REST, GraphQL and event contracts alongside implementations. V3 REST examples use `/api/...`; catalog reads use `/graphql` with `products`, `product(productId)` and `categories`. Public GraphQL must not mutate catalog products; authoring belongs in the PIM.
- The V3 event envelope contains `event_id`, `event_type`, `version`, `aggregate_id`, `occurred_at`, `payload` and `correlation_id`. Final topic names and versioning must be fixed in contracts.
- Publish business events through a transactional outbox. Implement idempotence, bounded retries, compensation and duplicate handling where required by the architecture.
- Payments are simulated. Keep synthetic seed data deterministic and separate from live activity.
- Frontend business values must come from actual services. Provide loading, empty and error states.
- Implement unique invoices for eligible successful payments, PDF storage in MinIO and replay-safe Mailpit notifications through workers and transactional events. PostgreSQL triggers must never call external services.
- Implement replay-safe quarterly batch aggregates plus event-time streaming, quality checks and four lakehouse zones. A local Spark job does not validate these pipelines.
- Purge only technical logs older than seven days on a weekly schedule. Preserve commercial records and financial audit trails; record purge start/end/count/status.
- The local AI assistant uses read-only parameterized Neo4j retrieval, verified relation provenance and current price/stock APIs. Do not grant unrestricted SQL/Cypher execution or database writes to the model; missing compatibility evidence means unknown.
- V3 requires a deterministic Python PC Build Solver behind the AI Assistant API. Return a complete BOM, exact integer-cent totals and remaining budget, compatibility evidence and price/stock check timestamps. Unknown critical constraints must never count as compatible; return `no_feasible_build` when constraints cannot be met.
- Support `POST /api/ai/builds` and optionally `GET /api/ai/builds/{build_id}` when builds are persisted. Qwen interprets preferences and explains solver output; it is not the solver. Revalidate prices and stock at checkout; a suggested build does not reserve stock. Verify AC-23 through AC-27, including physical fit, firmware, slots, quantities and power connectors.

## Local development

Run commands from the repository root. On Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-market.ps1 -SkipPackages -SkipContainers
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
```

Required phase-one services are PostgreSQL, MongoDB, Neo4j and UnoPim with its dependencies. Kafka is deferred and enabled only with -WithKafka. Existing Redis and MinIO infrastructure remain available. Prometheus and Grafana use the optional `monitoring` profile. MinIO is built from its pinned official source commit in `infrastructure/minio/Dockerfile`.

Compose retains the `market-hardware` project name and named volumes from the original local setup. Reuse its local `.env` when working with those existing volumes. Keep `.env`, virtual environments, dependencies, checkpoints and generated data out of Git.

Run `scripts/initialize-data.ps1` to migrate, seed and validate the local databases; run `scripts/verify-data.ps1` for live database tests. The importer reads and adds generated service credentials directly in the ignored `.env`. See `docs/phase2-database-setup.md`.

Run `scripts/start-catalog.ps1` for the catalog Compose profile and `scripts/verify-catalog.ps1` for unit and live Phase 2/3 regression tests. PIM approval binds content to its revision. After publication ownership transfers to the worker, seed fixtures cannot overwrite those projections. See `docs/phase3-catalogue.md`.

Run `scripts/start-commerce.ps1` (optionally `-WithKafka`), `scripts/verify-commerce.ps1` and `scripts/test-commerce.ps1` for Phase 4. Operator maps to API staff. PAID means captured payment plus committed inventory. Each service uses only its own schema role. Never hold SQL row locks across HTTP calls, accept customer simulation controls, or mark an event published before Kafka acknowledgement. See `docs/phase4-commerce.md`.

## Validation

Phase 5 runs one React application under frontend through Traefik. Run scripts/start-frontend.ps1 after commerce, then scripts/verify-frontend.ps1 and scripts/test-frontend.ps1. See docs/phase5-frontend.md and ADR 0004. Never embed DEV_* secrets in VITE_* variables. Access tokens stay in memory; refresh tokens use the Auth service's scoped HttpOnly SameSite cookie and are never read by frontend JavaScript. Checkout identities persist in tab storage across uncertain network outcomes. Respect backend stock/pricing/payment authority. Run gateway restarts and live acceptance tests sequentially.

- For infrastructure edits, validate with `docker compose --env-file .env -f docker-compose.yml config --quiet`.
- For Python dependency edits, run `.\.venv\Scripts\python.exe -m pip check` and verify affected imports.
- Run the relevant unit, contract, integration, E2E or recovery checks once the affected component exists. Do not add tests that only assert scaffold placeholders.
- Never report that service uptime proves the business workflow, Spark integration, or recovery behavior. Verify those features explicitly when implemented.

## Data handling

Do not commit secrets, print local credentials, reset existing database volumes, or run destructive database operations as routine setup. Initialization files are not automatically mounted into the current databases; implement and validate schema migrations before applying them.

## Phase 6 analytics

See docs/phase6-analytics.md and ADR 0005. The separately provisioned market_analytics database preserves market_db business schema ownership. The restricted analytics reader is an explicit read-only export exception: select granted source columns per table within one consistent snapshot, then join only exported entities in Spark. Business services retain the cross-schema prohibition. Use one driver, the advisory writer lock and the callback serialization lock; queue jobs through it. Preserve raw transport identities, event UUID dedup, checkpoints and immutable releases. Revenue is capture/refund payment-creation cohorts, never pending/failed payments or invented historical cash-flow dates. Publish a serving pointer only after committed Delta and zero reconciliation differences. Run recovery, commerce and browser suites serially.

## Phase 8 operations

Preserve Phase 6 financial semantics. Durable operational alerts live in market_analytics, with narrow alert-only writes for its otherwise read-only API role. Warehouse classifications are explicit, and physical capacity units must never be guessed. Separate checkpointed order-window detection uses a 10-minute watermark; it does not replace ingestion. Keep the original Delta writer serialization lock; the independent alert sink writes only its own SQL tables. Never run recovery/browser suites concurrently. New integrations must use the shared telemetry module and retain low-cardinality route labels. Kafka trace propagation is not claimed. Use scripts/start-platform.ps1 and verify-platform.ps1 without seeding, and record current results in docs/phase8-final-report.md. CI is defined but remote execution must not be claimed without evidence.
