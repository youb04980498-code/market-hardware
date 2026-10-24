# Phase 8 reproducible jury demonstrations

Start the retained local platform (never initialize/reseed):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-platform.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-platform.ps1
```

Use local DEV_ADMIN/DEV_CUSTOMER credentials from ignored .env / LOCAL-ACCESS.md; never paste credentials into reports.

A. Successful checkout: sign in to the storefront, choose published products with available stock and checkout. Observe frozen order lines, PAID, persisted Payment and decremented Inventory; wait for Analytics freshness/reconciliation. Automated proof: Phase4 successful_checkout_and_price_snapshot and Phase6 source reconciliation.

B. Failed payment and C/E stock/capacity: run the isolated Phase8 tests below. They use staff-protected plans, create TEST warehouses with explicit physical capacity, make genuine authorized stock adjustments, assert compensation and persistent alerts, then replenish. No historical financial record is edited.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/integration/test_phase8.py -k 'stock_saturation or payment_failure' -q
```

D. Kafka/Spark interruption: use the retained Phase6 recovery suite after commerce tests have finished. It stops/starts dependencies, retains checkpoints and compares reconciled results. Never run recovery/browser suites concurrently.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-analytics.ps1 -WithRecovery
```

F. Monitoring: open `/admin/observability`, http://localhost:3000, http://localhost:9090 and http://localhost:16686. Inspect real checkout traces across Orders/Inventory/Payments, HTTP route metrics and JSON request logs. To demonstrate degradation, stop only analytics, wait >1 minute for ServiceUnavailable, then start analytics and verify resolution. Storefront checkout remains independent. The automated outage test restores services in finally.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/integration/test_phase8.py -m recovery -q
```

Alert acknowledgement/resolution is available in the French admin page. Capacity saturation uses strictly >90%; unknown capacity remains unavailable. Event-time spikes require the documented baseline threshold, not an arbitrary frontend counter. Abandoned carts and AI remain explicitly deferred.
