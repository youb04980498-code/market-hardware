# Market Hardware storefront and administration

One React/TypeScript/Vite/Tailwind application. Run scripts/start-frontend.ps1 from the repository root after starting the existing commerce infrastructure. Open http://localhost:8080/ and /admin through Traefik. See docs/phase5-frontend.md for upstream provenance, licenses, contracts, security, tests and limitations.

For optional development: npm ci --ignore-scripts, npm run dev from frontend. Vite binds only 127.0.0.1:5173 and proxies relative /api, /graphql and /health calls to the existing local gateway. Runtime secrets never enter the browser bundle. Auth is in memory and requires login after a full browser reload.
