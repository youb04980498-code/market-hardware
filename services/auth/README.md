# Auth service

Entry point: uvicorn market_commerce.auth:app --host 0.0.0.0 --port 8080.
The shared implementation is in market_commerce/auth.py. The runtime has only its own schema credential.
Run scripts/start-commerce.ps1 and scripts/verify-commerce.ps1 from the root.
Swagger: http://localhost:8080/api/auth/docs. See docs/phase4-commerce.md.
