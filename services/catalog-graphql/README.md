# Catalogue GraphQL

FastAPI/Strawberry entry point: uvicorn market_catalog.api:app --host 0.0.0.0 --port 8080.
Shared implementation lives in ../../market_catalog/api.py to reuse the catalogue projection contract with the worker.
Run scripts/start-catalog.ps1 and scripts/verify-catalog.ps1 from the repository root.
Traefik exposes http://localhost:8080/graphql. See ../../docs/phase3-catalogue.md and ../../data/contracts/catalog.graphql.
