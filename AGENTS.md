# Working in Market Hardware

## Current state

This repository contains the project scaffold, the reference architecture, and working local infrastructure. Application services, frontend, contracts, table definitions, seed generation, pipelines, and application tests remain to be implemented. Keep documentation explicit about that status.

Read `docs/architecture/MARKET_HARDWARE_ARCHITECTURE.md` before implementing a component. Record material architecture changes in `docs/ADR/` and update the affected contracts and documentation with the implementation.

## Architecture conventions

- Backend: Python 3.12, FastAPI, Pydantic, SQLAlchemy and Alembic; Strawberry GraphQL for the catalog.
- Frontend: React, TypeScript, Vite, Tailwind CSS and Recharts, organized around the five feature directories.
- PostgreSQL uses one `market_db` database with `orders`, `inventory`, `payments`, and `auth` schemas. Each service owns its schema and must use a distinct, restricted database role when implemented.
- Do not add SQL foreign keys, joins, or direct database reads across service boundaries. Catalog data belongs in MongoDB `market_catalog.products`.
- Reuse the catalog's numeric `product_id` throughout SQL, events, API responses and the lakehouse. MongoDB `_id` is not a business identifier.
- Represent money as integer cents and timestamps as UTC ISO 8601 / PostgreSQL `TIMESTAMPTZ`.
- Develop REST, GraphQL, and event contracts alongside implementations. Version APIs and Kafka topics.
- Publish business events through a transactional outbox. Implement idempotence, bounded retries, compensation and duplicate handling where required by the architecture.
- Payments are simulated. Keep synthetic seed data deterministic and separate from live activity.
- Frontend business values must come from actual services. Provide loading, empty and error states.

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
