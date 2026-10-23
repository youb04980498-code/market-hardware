# Working in Market Hardware

## Current state

This repository contains the project scaffold, the reference architecture, and working local infrastructure. Application services, frontend, contracts, table definitions, seed generation, pipelines, and application tests remain to be implemented. Keep documentation explicit about that status.

Read `docs/MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md` before implementing a component. It is the governing functional and technical specification, including MUST requirements and acceptance criteria AC-01 through AC-27. `docs/architecture/MARKET_HARDWARE_ARCHITECTURE.md` is historical V1 context; V3 takes precedence wherever they differ. Record material architecture decisions in `docs/ADR/` and update affected contracts and documentation with the implementation.

The directory layout remains the V1 scaffold. The root Compose stack now includes Neo4j and the upstream UnoPim services, including its dedicated PostgreSQL database, Redis, Elasticsearch, workers and Mailpit. Migrate toward the V3 layout as components are implemented. Ollama/Qwen, product synchronization, invoicing, notifications, log retention and quarterly processing remain to implement. Running infrastructure does not validate the application workflows.

## Architecture conventions

- Backend: Python 3.12, FastAPI, Pydantic, SQLAlchemy and Alembic; Strawberry GraphQL for the catalog.
- Frontend: React, TypeScript, Vite, Tailwind CSS and Recharts, organized around the five feature directories.
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

Core containers are PostgreSQL, MongoDB, Kafka, Redis and MinIO. Prometheus and Grafana use the optional `monitoring` profile. MinIO is built from its pinned official source commit in `infrastructure/minio/Dockerfile`.

Compose retains the `market-hardware` project name and named volumes from the original local setup. Reuse its local `.env` when working with those existing volumes. Keep `.env`, virtual environments, dependencies, checkpoints and generated data out of Git.

## Validation

- For infrastructure edits, validate with `docker compose --env-file .env.example -f docker-compose.yml config --quiet`.
- For Python dependency edits, run `.\.venv\Scripts\python.exe -m pip check` and verify affected imports.
- Run the relevant unit, contract, integration, E2E or recovery checks once the affected component exists. Do not add tests that only assert scaffold placeholders.
- Never report that service uptime proves the business workflow, Spark integration, or recovery behavior. Verify those features explicitly when implemented.

## Data handling

Do not commit secrets, print local credentials, reset existing database volumes, or run destructive database operations as routine setup. Initialization files are not automatically mounted into the current databases; implement and validate schema migrations before applying them.
