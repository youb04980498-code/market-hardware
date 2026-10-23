# ADR 0005: durable lakehouse with snapshot reconciliation and atomic serving

Status: accepted after live verification on 2026-10-23.

Use existing Kafka outboxes unchanged. Spark Structured Streaming records each Kafka transport record in Bronze Delta and quarantines invalid envelopes. Event identity deduplicates business notifications; event occurrence time and transport order are distinct. Late events are retained, not discarded by a financial watermark.

Events are not complete change-data capture. Authoritative repeatable-read snapshots with narrowly granted source columns reconcile Silver and allow older history to be imported honestly. Periodic snapshots also cover changes that lack lifecycle events, such as a partial refund or stock adjustment. Snapshot cutoff/content identity prevents overlap from counting twice. Events observed after a cutoff become visible on a later snapshot. Analytical joins occur in Spark; no business-service cross-schema SQL dependency is introduced.

Gross captures are payments currently SUCCEEDED or REFUNDED. Successful refund records determine modern refunds; historical REFUNDED status without refund rows means the captured amount is fully refunded, with unknown refund occurrence date. Reporting periods use payment-creation cohorts with latest-known refunds so late refunds correct the original cohort. Do not label these as historical refund cash flows. Product attribution uses frozen line amounts and deterministic cumulative integer-cent proportional allocation; classify by current published category only when the order has no frozen category. Unknown categories remain UNKNOWN.

One Spark driver owns Delta tables under a private MinIO bucket. A persistent session advisory lock prevents independent writers from concurrently modifying them. Manual jobs wait for the same lock or are submitted to that driver; no business row transaction spans network work. Checkpoints use S3A storage and remain intact across restart.

Write Gold durably before publishing immutable versioned serving data plus the current-release pointer in one PostgreSQL transaction. Keep serving tables in a separate market_analytics database, preserving market_db's exactly four business schemas plus monitoring. Readers never observe partially published releases. Analytics auth reuses JWT verification and the existing public Auth /me endpoint; no caller impersonation or new trusted-service role is necessary.

The API serves already materialized Gold, not Spark SQL or arbitrary files. Analytics remains optional and never enters the checkout dependency chain. Snapshot-based freshness, eventual consistency, original historical/synthetic data and retained verification activity are labelled explicitly. No Phase 7/8 work is included.
