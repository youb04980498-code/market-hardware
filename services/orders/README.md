# Orders service

Entry point: uvicorn market_commerce.orders:app --host 0.0.0.0 --port 8080.
The shared implementation is in market_commerce/orders.py. The runtime has only its own schema credential.
Run scripts/start-commerce.ps1 and scripts/verify-commerce.ps1 from the root.
Swagger: http://localhost:8080/api/orders/docs. See docs/phase4-commerce.md.
