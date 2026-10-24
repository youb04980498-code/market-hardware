# Administration overhaul

## Audit and implementation plan

React 19, TypeScript, Vite, React Router, Recharts and Lucide are already installed. The six lazy admin routes share AdminLayout. Auth restores sessions with the existing HttpOnly refresh cookie; staff/admin guards remain unchanged. Commerce REST, published GraphQL, Phase6 analytics and Phase8 operational endpoints remain the authorities. Storefront and checkout are outside this redesign.

Implementation order: shared desktop shell/tokens/components; executive overview; product workspace; warehouse risks; order investigation; financial analytics; reliability topology; one screenshot refinement pass; focused build/types/unit and six browser smoke checks; local commit.

## Design decisions

The project-local `.agents/skills/dashboard-design` is installed using Codex's skill installer from `abdiraimov-otabek/dashboard-design-skill/skills/dashboard-design`. It contains Markdown references, no executable scripts or runtime dependencies. MIT license is retained. AGENTS.md links its entry point. Applied rules: one first-glance question per page, KPI-to-investigation hierarchy, semantic tokens, quiet share bars, exact units, real unavailable states, expanding desktop grids and screenshot inspection. User-requested desktop-only/light-content design overrides mobile/dark examples. Real API values replace the skill's suggested QA seeding; no fixture or business data is changed.

UI/UX Pro Max's data-dense dashboard guidance supplements the required skill. Its generic marketing/landing suggestions are inapplicable to this admin product and are not used.

## Data boundaries

Catalogue lists the published active-product projection. The initial four-card version honestly marked PIM totals unavailable because GraphQL did not expose authoring state; the user requested the real connection, so the final implementation adds staff-only `GET /api/catalog/operations`. The existing PIM worker records totals during its existing complete REST enumeration, with no extra PIM API request or authoring mutation. Catalogue's existing read-only Mongo account reads that technical observation and current job states; Auth's HTTP session check enforces staff/admin. No PIM authoring credential is passed to the read API or browser. Source observations older than 120 seconds are explicitly stale; interrupted scans retain the last complete observation. Drafts are separate from PENDING jobs. Current errors deduplicate rejected/ERROR products and exclude historical resolved failures. Product images remain unavailable when the published payload supplies none. No direct catalogue edits are added.

Inventory capacity is physical item units. Warehouse REST is current; product-level analytical stock is a timestamped snapshot. Historical stock movements are not exposed. Operational/test/archive classification is preserved.

Orders list is paginated REST; list filters apply to a fully retrieved bounded collection (up to 5,000 rows, with truncation disclosed). Order details use the actual persisted current Saga, frozen lines and canonical payment. The lifecycle is a current-state interpretation, not a fabricated transition history. No invented shipping events, stage timestamps, customer profile, reservation ID or mutations are added. Successfully compensated terminal failures are not marked unresolved.

Financial views preserve payment-creation UTC cohorts with latest known refunds, integer-cent money and gross captured AOV. Purchasing customers are labelled as buyers in the selected period, never realtime active sessions. Unsupported prior-period comparison is unavailable. No financial calculation is changed.

Monitoring health is bounded to the actual matching scrape/readiness measurement. Topology expresses configured dependencies, not inferred availability. Missing Neo4j/resource/history/trace samples stay unavailable. Monitoring credentials and infrastructure API requests remain server-side behind staff authentication; browser links only open the existing local tools.

## Verification

See the execution results below. No mobile/recovery/backup suite is part of this frontend task. Existing tests are retained.

## Delivered pages

| Destination | First-glance story and investigation |
|---|---|
| Overview | Today's UTC orders, net revenue, captured AOV and purchasing customers; hourly volume, ranked category shares, prioritized incidents, six actual HTTP readiness checks and contextual links. Longer periods use daily volume. |
| Catalogue | Actual UnoPim population and sync status, published category counts, combined name/SKU/category/publication/stock filters, sorting, pagination and a native product detail drawer with technical attributes and current warehouse stock. |
| Inventory | Physical/available totals, snapshot risk counts, warehouse capacity cards, explicit test/archive inclusion, stock/alert tabs, urgency-ranked rows and warehouse investigation. |
| Orders | Status/date/payment-outcome filters, search/pagination, a selected order workspace, canonical payment and current persisted lifecycle interpretation. Selected orders survive browser refresh through the URL. Existing full order management links and routes remain. |
| Analytics | Four financial KPIs, selectable revenue series, ranked categories/products, data-derived observations, secondary sales/product/customer/warehouse/report tabs, CSV export and expandable reconciliation. Financial definitions are unchanged. |
| Observability | Twelve real scrape targets, service P95/5xx/lag indicators, a clickable fourteen-node configured topology, bounded historical P50/P95/P99/traffic charts, streaming state, process resources, technical alerts, sanitized recent traces and service drawers. |

Shared pieces: navy desktop shell, six active navigation destinations, existing user/logout controls, PageHeader, KPI strip, semantic badges, panels, range calendar, filter controls, pagination, share bars, drawers, lifecycle timeline, freshness, skeleton/empty/error states and a refresh-preserving request hook. Existing Recharts/Lucide dependencies are reused. No runtime dependency was added. Storefront CSS and commerce business logic are unchanged.

The user's reference image informed the compact sidebar, restrained blue accents, KPI hierarchy, warehouse cards and order list/detail layout. Its sample numbers, comparisons, images and unsupported mutations were not copied.

## Minimal compatible API additions

- Analytics observability adds actual P50/P99/process measurements, a fixed-query 30-minute history endpoint and ten whitelisted-service trace summaries from the existing Jaeger backend. Staff checks are reused; no arbitrary PromQL/URL/time range, headers, span tags, logs or tokens are returned.
- Catalogue operations adds the real PIM worker observation and current job counts described above. Public GraphQL remains unchanged. Traefik exposes only the staff-protected new route; authoring secrets stay in the existing synchronization worker. The new REST OpenAPI export is versioned beside the existing exports.
- Only affected frontend, Analytics and Catalogue/sync images were rebuilt. Traefik was reloaded for Windows file mounts. No service credentials, SQL migration, product fixture, payment/Saga logic, volume, offset or checkpoint was changed.

## Measured execution results — 2026-10-24

- Seven focused frontend component checks passed (3.83s Vitest wall duration). The changed UTC calendar was retried separately: one passed, six deliberately deselected, 4.34s.
- Two sanitized-monitoring/route-dependency backend checks passed in 1.86s; two PIM observation/error-dedup/staleness checks passed in 1.75s. The FastAPI test client emitted its existing httpx deprecation warning; no test failed.
- Six distinct Chromium page smoke scenarios have passing latest executions. The first six-page run took 117.740s: three passed, two contrast assertions failed and one selector timed out. Category/order count badges measured 4.25:1 and were darkened; explicit accessible selector names fixed the timeout. Four affected/refined scenarios then passed in 20.840s. The user-requested PIM connection added a focused Catalogue retry, which passed in approximately 7 seconds. Original failure reports are retained locally; no complete regression rerun is claimed.
- Browser coverage includes API-to-KPI equality, filters/pagination, product/warehouse/service drawers, canonical order lifecycle, reload persistence, export and reconciliation navigation, no runtime exceptions, and no serious/critical axe findings on the six captured desktop pages.
- Live PIM verification independently enumerated **43** UnoPim products and matched the staff API: **42** active published, **1** inactive retained, **0** pending jobs, **0** current publication errors. Source scan and worker were fresh/healthy. Unauthenticated/customer requests returned 401/403; staff returned 200. See [PIM evidence](evidence/admin-pim-status.json).
- Production TypeScript/Vite builds, standalone type checking, ESLint, scoped Ruff, OpenAPI comparison, Compose validation and secret scanning passed. After screenshot/a11y fixes and the user's PIM addition, only the affected images/checks were repeated. All 27 tracked source-data/V3 requirement files remained unchanged after Git line-ending normalization.
- Browser measurements found no page overflow at 1440px. Overview also passed at 1280/1920/3440; the ultrawide content exceeded 2800px instead of sitting in a narrow centered column. Actual screenshot files were opened and reviewed. Initial screenshots were followed by one layout/readability pass and focused accessibility/data-connection corrections.

Machine-readable run evidence: [admin-overhaul-tests.json](evidence/admin-overhaul-tests.json). Existing browser scenarios remain present with updated desktop inputs/selectors; the full legacy suite was not executed. No full Phase1–8, commerce recovery, Kafka/Spark outage, backup/restore or mobile testing was run.

## Screenshots

Private/local screenshots are in `C:\market-hardware\.local\screenshots\admin-overhaul\`:

- `overview-1440.png`, `catalog-1440.png`, `inventory-1440.png`, `orders-1440.png`, `analytics-1440.png`, `observability-1440.png`.
- `overview-1920.png`, `overview-3440.png`, `observability-top-1440.png`, `catalog-drawer-1440.png`.

They are intentionally ignored by Git. Full-page modal screenshots include content below the viewport; the native modal/backdrop itself occupies the visible viewport.

## Remaining interface limits

Source descriptions/images may be absent. Draft/inactive product lists, detailed PIM validation editing, stock-movement history and customer profile lookups are not exposed by the reused APIs; their data is not fabricated. PIM aggregate totals are now connected. Product-level stock tables are analytical snapshots; the product drawer fetches current Inventory REST values. A warehouse's classification is used exactly as returned, without silently reclassifying older fixtures by name. Prior-period comparisons require elapsed-time equivalence and are not invented.

The lifecycle labels describe current persisted evidence, not an invented chronological event journal. An aged nonterminal order is labelled for review, not asserted to be a stuck Saga. Missing host/container/storage metrics and Neo4j scrape health stay unavailable; exporter reachability is explicitly distinct from database readiness. AI remains postponed. Administration below 1280px is outside the requested desktop contract.

## Reproduce

Open `http://localhost:8080/admin` using the existing local staff/admin account. The installed dashboard skill is project-local and discoverable through AGENTS.md on future turns.

```powershell
Set-Location C:\market-hardware\frontend
npm run typecheck
npm run lint
npx vitest run src/admin/admin.test.tsx
npm run e2e -- tests/admin-overhaul.spec.ts
```

The implementation is committed locally after final diff/secret review; no push or remote CI execution is claimed. Use `git log -1 --oneline` for the exact commit.
