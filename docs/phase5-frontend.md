# Phase 5: storefront and administration

One React application runs locally through the existing Traefik gateway. The repository structure, four business schemas, Phase 1–4 implementations, migrations and source datasets are preserved. No new backend or database migration is introduced.

## Upstream sources, licenses and audit

| Source | Exact commit | License | Reuse |
| --- | --- | --- | --- |
| https://github.com/danilo62x/ecommerce-react | da9bb332f89aabbd412f204f22117f6d48a5e85c | MIT, Copyright 2026 Danilo Quinelato | Store shell/navigation/account patterns, product-card structure, quantity stepper, persisted Zustand cart, route splitting and i18next setup |
| https://github.com/shadcndashboard/shadcndashboard | 386235c3199168fa743db593d7acf014a40f1ca1 | MIT, Copyright 2026 Shadcn Dashboard | Card and Table primitives; sidebar/inset/header/Outlet composition |

Both repositories were cloned and inspected outside the project in `C:/market-template-audit`. No upstream setup scripts were executed. Both complete MIT notices are retained in `frontend/public/licenses/` and served at `/licenses/ecommerce-react.txt` and `/licenses/shadcndashboard.txt`.

Pinned runtime dependency license/copyright notices are also preserved in `/licenses/dependencies.txt`.

The storefront uses Vite 6/TypeScript 5; the dashboard uses Vite 8/TypeScript 6. This application deliberately selects React 19.3.1, Vite 8.3.5, TypeScript 6.0.3 and Tailwind 4.3.3. Dependencies have exact versions and a committed package-lock. Node 24.11.1 and Nginx 1.29.3 base images are pinned by digest. `npm ci --ignore-scripts` installs dependencies; the inspected build runs explicitly.

On 2026-10-23 each upstream lockfile reported ten npm advisories: storefront eight high/two moderate; dashboard nine high/one moderate. Affected dependency trees included Vite, Router, PostCSS and, in the dashboard, Tiptap/ProseMirror/SVGO. The consolidated application reports zero npm audit vulnerabilities. This is package advisory coverage, not an assertion about every OS or application vulnerability. Raw original reports remain outside Git at `C:/market-template-audit/*-audit.json`.

No upstream `.git`, MSW runtime worker, Chance fixtures, fake products/orders/revenue, coupons, reviews, shipping promises, PWA caching, wishlist, blog/ticket apps or demo payment processors are imported. Formik/Yup are replaced with labelled native forms and server validation. Recharts awaits actual Analytics endpoints.

## Design workflow

At the user's request, `ui-ux-pro-max` was installed using the system skill-installer into `C:/Users/Bellouch/.codex/skills/ui-ux-pro-max`. Its complete SKILL.md and relevant quick-reference/pro-rules were read. The initial premium query matched Apple glass/luxury fashion and was rejected; a narrowed electronics/ecommerce query matched E-commerce. Its verified output is retained under `docs/design-system/market-hardware/`, with explicit storefront overrides. React form guidance was retrieved after narrowing an initially empty query.

The application uses forest/ink/neutral colors, consistent typography and native controls, visible keyboard focus, skip links, 44px controls, responsive cards and reduced-motion support. Original generic SVG component illustrations are labelled as illustrations. The catalogue exposes no licensed manufacturer imagery, so model-specific photographs are not fabricated or scraped. French is primary. The upstream i18next mechanism remains, with a small English common-label dictionary; full English localization is deferred.

## Application structure and routes

`frontend/src/main.tsx`, App.tsx and AuthProvider provide one entry point, router and authentication implementation. Lazy route modules share typed API clients, keyed asynchronous state, money formatting, feedback and UI primitives. Storefront and administration have separate layouts within the same application. Existing feature placeholder directories are preserved.

| Route | Implemented behavior |
| --- | --- |
| `/` | Live featured products, category navigation, search and Builder entry |
| `/shop` | Real GraphQL search/category/brand/maximum-price filtering and pagination |
| `/products/:id` | Technical attributes, current price/publication, authenticated stock and compatibility provenance |
| `/cart` | Persistent ID/quantity/indicative prices; no authoritative business calculation |
| `/checkout` | Login, warehouse selection, server revalidation and idempotent simulated checkout |
| `/login`, `/register` | Real Auth; public registration assigns customer |
| `/account` | Current profile and own paginated persisted orders |
| `/account/orders/:id` | Frozen lines, Saga progress, actual payment and permitted cancellation |
| `/pc-builder` | Budget/use-case controls; explicit Phase 7 unavailable state |
| `/admin` | Restricted overview, source-labelled counts and live REST readiness |
| `/admin/orders`, `/admin/orders/:id` | All-customer orders and authorized details |
| `/admin/catalog` | Published versions/source/validation; master editing belongs to UnoPim |
| `/admin/inventory` | Actual product/warehouse physical, reserved and available quantities |
| `/admin/pc-builder` | Unavailable Phase 7 diagnostics |
| `/admin/analytics` | Contextual Phase 6 integration state, no fabricated KPI |
| `/admin/observability` | REST readiness and clearly identified missing telemetry integrations |

The primary admin menu contains exactly five sections: Overview, Orders, Catalog, Inventory and AI PC Builder. Analytics/Observability are contextual links. API staff corresponds to the existing database operator mapping. Hiding controls never substitutes for server authorization.

## API mapping and security

- GraphQL uses the actual `products`, `product(productId)`, `brands` and `compatibleProducts` contracts. Unsupported price sorting is explicitly explained. Product IDs remain strings until checkout; unsafe JavaScript integer conversions are rejected rather than rounded.
- Auth uses register/login/me/refresh/logout. Access and refresh tokens remain in memory, never browser storage. Concurrent 401 responses share one refresh rotation. Revocation clears the session. Logout immediately clears local credentials. Reloading the application requires login with an internal redirect back.
- Inventory uses product totals and per-warehouse reads. Anonymous users are told to log in because the existing API requires authentication. Cards show actual totals after login. Checkout revalidates every line in the selected warehouse.
- Orders uses cart/validate, keyed POST checkout, own/all-customer pagination, details and cancellation. The browser submits only product IDs, quantities and warehouse. It sends no authoritative price, amount, simulation or outcome.
- Payment details use the authorized Payments endpoint. Orders orchestrates the simulated charge; no separate browser payment system bypasses reservations.
- Health indicators observe public REST readiness only. Browser code accesses no database, internal service command or unrestricted graph query.

The cart persists non-sensitive references and clearly labelled estimates in localStorage. Before POST, checkout freezes the request, user identity and UUID key in tab sessionStorage. An ambiguous network failure retains that attempt. Retrying uses the same body/key. An accepted order clears the cart and navigates to persisted status; incomplete Sagas always remain pending. Only complete terminal server states show confirmation, rejection or refund.

Test simulation plans are configured only by the privileged E2E harness using existing Phase 4 controls, never by customer UI forms. Development credentials are read from the root ignored `.env` by test Node code; they are not embedded in browser bundles or VITE variables. Existing disabled fixtures remain disabled.

## Windows startup and configuration

```powershell
cd C:\market-hardware
# If the backend is not already running:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-commerce.ps1 -WithKafka
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-frontend.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-frontend.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-frontend.ps1
```

Open `http://localhost:8080/` and `/admin`. Use existing DEV_ADMIN_EMAIL/PASSWORD or DEV_CUSTOMER_EMAIL/PASSWORD values from `.env`; do not paste secrets into commands or Git.

start-frontend checks backend readiness, builds only the frontend, starts it with `--no-deps`, waits for health and explicitly reloads Traefik's file routes. It never resets volumes, seeds data, changes Kafka settings or starts future services. Do not run startup/restarts concurrently with live acceptance tests. Application rollback can stop only frontend and restore the previous gateway file while retaining commerce/data.

The `frontend` profile uses the original network. Nginx serves internally on 8080 with no new host-published port. Its SPA fallback is low priority and excludes `/api`, `/graphql`, `/internal` and `/health`. Deep links return the application; unknown internal/API routes retain 404. Nginx supplies CSP, frame denial and MIME-sniffing protection. Local HTTP remains as in earlier phases.

`VITE_API_BASE_URL` defaults to an empty same-origin base; application logic contains no fixed backend host. Docker production supports relative requests with a self-only CSP. Optional development runs `npm ci --ignore-scripts` then `npm run dev` under frontend; Vite binds `127.0.0.1:5173` and proxies through the existing gateway. `FRONTEND_URL` controls only the test gateway URL. No frontend secrets or env.example changes are required.

`FRONTEND_JUNIT_FILE` optionally selects the browser report path; verify-frontend uses `.local/frontend-smoke.xml` so smoke checks preserve the full E2E report.

## Tests and screenshots

verify-frontend installs pinned dependencies/Chromium and runs live storefront/admin/checkout smoke checks. test-frontend runs earlier-phase regressions before frontend lint/typecheck/unit/build/audit and Playwright. `-SkipBackend` is available when the unchanged backend suite has just passed independently.

The browser harness uses a dedicated warehouse and stock provisioned through Inventory REST, returns unused stock through an authorized adjustment and checks for lingering reservations. Financial records remain for audit. It never regenerates or overwrites original fixtures. Trace/video/automatic screenshots are off to avoid recording authentication secrets; deliberate screenshots show product and dashboard screens only.

Reports: `.local/frontend-unit.xml`, `.local/frontend-e2e.xml`. Screenshots: `.local/screenshots/storefront-{375,768,1024,1440}.png` and `admin-{375,768,1024,1440}.png`. These stay local/ignored. Screenshots are manually inspected; browser checks cover page overflow, serious console/page errors and serious/critical axe violations.

## Limitations and later phases

Phase 6 Analytics/streaming/quarterly KPIs are unavailable. No approved API exposes global PIM sync jobs, Kafka lag, tracing or capacity utilization. Inventory is read-only here; existing privileged commands remain protected by the backend. Historical committed stock is not fabricated from current quantities. Orders offers pagination but no server search/status filter, which the list explains.

Phase 7 AI/solver/LLM functionality is deferred; Builder controls produce no recommendations, prices or compatibility claims. Phase 8 invoices/PDFs/email/notification workers and extended operations remain deferred. Payments are simulated. Shipping, returns and invoice UI remain limited by current contracts. Full English localization, manufacturer photography and production TLS are not claimed. Full-page refresh requires reauthentication because there is no HttpOnly cookie-session backend contract.

## Verification results

Verified locally on 2026-10-23 against actual Docker services:

- 231 Phase 2/3/unit backend regressions passed; zero failures/errors/skips.
- All 45 Phase 4 live concurrency/recovery/Kafka checks passed on the sequential rerun; zero failures/errors/skips.
- 23 frontend unit/component checks passed; zero failures/errors/skips.
- 15 real-service Chromium checks passed, covering live products/search/detail/cart, publication visibility, auth, stock, customer/admin authorization, checkout success/decline/pending recovery, ordinary server-validated checkout, deep links, responsive layouts and accessibility.
- Total: 314 distinct automated checks passed. Repeated runs of the same checks are not counted as new tests.
- Lint, TypeScript checks, production build, npm audit, Compose configuration, Python dependency compatibility and PowerShell parsing passed. The final npm audit reports zero vulnerabilities.
- The production frontend and required backend/data/PIM/Kafka services are healthy. Optional legacy services without configured health checks are only reported as running.
- Final read-only audit: zero incomplete Sagas, zero active Phase 5 test reservations, zero pending outbox events, zero active legacy non-Argon accounts and 42 active catalogue products. Gateway storefront/deep links and runtime dependency notices returned HTTP 200; `/internal/validate` retained HTTP 404.
- Eight screenshots cover storefront/admin at 375, 768, 1024 and 1440 pixels. Visual review corrected French text encoding, tablet heading wrapping and capture readiness. Browser checks found no page-wide overflow or serious console/page errors; axe found no serious/critical violations in the tested storefront/admin states.

During verification, incorrect test selectors and a redundant account-navigation wait were corrected. Axe exposed mismatches between visible text and accessible link names; the application labels were fixed. One backend run was interrupted by an overlapping gateway restart during fixture setup: 231 regressions passed, then 35 Phase 4 setup errors shared the same disconnected request. With gateway operations serialized, all 45 Phase 4 checks passed. No backend business rule, original test or fixture was changed to obtain these results.

start-frontend, verify-frontend (three live smoke checks) and test-frontend were executed successfully on Windows. The frontend test script used `-SkipBackend` only after the independent 276 backend checks had passed. Original business implementations, V3 requirements and all tracked source datasets remain unchanged. Source/secret scans and final Git checks are recorded with the implementation commit.

## Change manifest

- AGENTS.md
- README.md
- docker-compose.yml
- docs/ADR/0004-consolidated-frontend.md
- docs/design-system/market-hardware/MASTER.md
- docs/design-system/market-hardware/pages/storefront.md
- docs/phase5-frontend.md
- frontend/.dockerignore
- frontend/Dockerfile
- frontend/README.md
- frontend/eslint.config.js
- frontend/index.html
- frontend/nginx.conf
- frontend/package-lock.json
- frontend/package.json
- frontend/playwright.config.ts
- frontend/public/licenses/dependencies.txt
- frontend/public/licenses/ecommerce-react.txt
- frontend/public/licenses/shadcndashboard.txt
- frontend/src/App.tsx
- frontend/src/admin/layouts/AdminLayout.tsx
- frontend/src/admin/pages/Catalog.tsx
- frontend/src/admin/pages/Dashboard.tsx
- frontend/src/admin/pages/Inventory.tsx
- frontend/src/admin/pages/Orders.tsx
- frontend/src/api/client.ts
- frontend/src/api/market.ts
- frontend/src/auth/session.tsx
- frontend/src/hooks/useResource.ts
- frontend/src/main.tsx
- frontend/src/shared/QuantityStepper.tsx
- frontend/src/shared/State.tsx
- frontend/src/shared/card.tsx
- frontend/src/shared/commerce.test.tsx
- frontend/src/shared/i18n.ts
- frontend/src/shared/orderStatus.ts
- frontend/src/shared/table.tsx
- frontend/src/shared/utils.ts
- frontend/src/storefront/cart.ts
- frontend/src/storefront/components/ProductCard.tsx
- frontend/src/storefront/layouts/StoreLayout.tsx
- frontend/src/storefront/pages/Account.tsx
- frontend/src/storefront/pages/Builder.tsx
- frontend/src/storefront/pages/Cart.tsx
- frontend/src/storefront/pages/Catalog.tsx
- frontend/src/storefront/pages/Checkout.tsx
- frontend/src/storefront/pages/Login.tsx
- frontend/src/storefront/pages/Product.tsx
- frontend/src/styles/app.css
- frontend/src/test-setup.ts
- frontend/src/types/index.ts
- frontend/tests/market.spec.ts
- frontend/tsconfig.json
- frontend/vite.config.ts
- infrastructure/traefik/catalog.yml
- scripts/start-frontend.ps1
- scripts/test-frontend.ps1
- scripts/verify-frontend.ps1
