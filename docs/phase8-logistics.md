# Phase 8 logistics and warehouse capacity

`inventory.warehouses.capacity_units` already existed and remains unchanged. Unit: count of physical item units, independent of SKU count. Utilization = SUM(stock.quantity)/capacity_units * 100. Reserved stock is included in physical stock and is not counted twice. A zero/unknown effective capacity yields null utilization and an unavailable UI state, never an invented percentage.

Migration 011 adds OPERATIONAL / TEST / ARCHIVED metadata. Migrations 013/014 classify only known test-generator provenance established by exact name-prefix and city pairs in the existing integration/browser tests. No commercial order, payment or inventory quantities are rewritten. New test fixtures declare TEST explicitly. Unrecognized warehouses retain OPERATIONAL and require operator review rather than speculative automatic classification.

GET `/api/inventory/warehouses` returns capacity, physical/reserved/available stock, low-stock reference count, classification and utilization. Staff may use `include_test=true` to include test/archived warehouses. Default warehouse summaries, the administration per-product stock table and the Analytics inventory endpoint exclude TEST/ARCHIVED; Analytics exposes its own optional include_test query. The per-product compatibility endpoints retain their historical contracts.

The existing French Inventory page adds capacity cards and the explicit include-test toggle; existing stock views remain. Overview adds actual daily materialized metrics and hourly order counts. Unknown and stale data are explicitly labeled. No capacity is inferred from the number of product records.
