# Phase 6 KPI definitions

All money is integer EUR cents. Source currency mismatches stop publication rather than silently converting or summing currencies. Date boundaries are UTC, start inclusive/end exclusive. Payment timestamps are creation-cohort timestamps, not asserted historical capture or refund occurrence times.

| Measure | Definition |
| --- | --- |
| Gross captured revenue | Sum `payments.amount_cents` where current payment status is SUCCEEDED or REFUNDED |
| Refunded revenue | Sum SUCCEEDED refund amounts per captured payment; for historical REFUNDED payments without successful modern refund rows use the full captured amount |
| Net revenue | Gross minus refunds; FAILED and PENDING payments contribute zero |
| AOV | Gross captured cents / distinct captured orders, rounded half up to an integer cent; includes subsequently refunded orders |
| Order count | All persisted orders in order-creation date cohort, independently of payment outcome |
| Paid orders | Current PAID, SHIPPED or DELIVERED orders |
| Cancelled orders | Current CANCELLED orders |
| Pending orders | Current PENDING or STOCK_RESERVED orders |
| Captured orders | Distinct orders with a captured payment, including later refunded orders |
| Gross units sold | Frozen line quantities for captured orders; no inferred physical returns |
| Product revenue/refunds | Gross is the frozen line amount after validating capture equals the frozen order total. Refund attribution is the difference of cumulative proportional integer divisions, ordered by product/line ID; each line stays bounded and all cents reconcile |
| Categories | Current approved catalogue category; UNKNOWN if unavailable for a historical product; never presented as historical taxonomy |
| Physical stock | Current observed `inventory.stock.quantity` |
| Reserved stock | Current observed `reserved_quantity` |
| Available stock | Physical minus reserved, per product/warehouse |
| Low stock | Available ≤ configurable threshold, default 5; includes zero, never an inferred historical movement |
| Registered customers | Orders customer registry creation cohort, not all Auth registrations |
| Purchasing customers | Distinct pseudonymous customers with a captured order in payment-creation cohort |
| Repeat customers | Customers with more than one captured order in the selected cohort |

Partial refunds preserve gross capture and reduce net by the actual successful refund amount. Failed/pending refunds do not reduce net. A full refund does not infer that goods physically returned to inventory. Modern audit rows are evidence, not a second revenue source: adding them to payment captures would double-count money.

Quarterly reports select precomputed Spark Gold using UTC calendar-quarter boundaries. A late refund changes the original payment cohort's latest-known net revenue. Re-running the original quarter stores a new release-specific correction; the old report remains auditable. This is a payment-creation cohort report, **not** a historical refund cash-flow statement. Old REFUNDED fixtures have no reliable refund occurrence timestamp, so inventing a refund-day series would be incorrect.

Gold dates and statuses use the authoritative snapshot, so a very recent event can be in Bronze before it is visible in the current serving version. The API exposes this eventual consistency explicitly. Nothing in the dashboard is a checkout reservation or a promise of live available stock.
