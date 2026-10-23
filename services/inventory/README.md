# Inventory service

Entry point: uvicorn market_commerce.inventory:app --host 0.0.0.0 --port 8080.
The shared implementation is in market_commerce/inventory.py. The runtime has only its own schema credential.
Run scripts/start-commerce.ps1 and scripts/verify-commerce.ps1 from the root.
Swagger: http://localhost:8080/api/inventory/docs. See docs/phase4-commerce.md.
