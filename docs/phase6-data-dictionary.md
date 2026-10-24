# Phase 6 lakehouse dictionary and lineage

Root: `s3a://market-lakehouse/`. Delta tables contain Parquet data plus `_delta_log`; checkpoints contain Spark offset/commit/state metadata. Existing source CSV/JSON fixtures stay in Git; generated lakehouse data stays in MinIO, never Git.

## Raw and staging

`raw/kafka_events` primary key is `transport_id = topic:partition:offset`. Columns: topic STRING, partition INT, offset LONG, kafka_key STRING nullable, kafka_timestamp STRING UTC, raw_payload STRING decoded for inspection, raw_base64 STRING preserving exact original bytes, payload_hash STRING canonical JSON SHA256, ingested_at STRING UTC, event_id/type STRING nullable, event_version INT nullable, occurred_at STRING nullable, business_identity STRING, parsing_status STRING, error_code STRING nullable, late BOOLEAN. Envelope schema is the unchanged `data/contracts/events/market.commerce.v1.schema.json`.

`staging/invalid_events` has the same schema and transport key. Diagnostics include malformed JSON/UTF8, non-object JSON, unknown versions, schema violations, source/topic mismatch and conflicting reuse of an event ID. Quarantine does not delete Bronze. Valid financial envelopes are never treated as authoritative entity upserts.

`raw/source_snapshots` columns: release_id STRING PK, observed_at STRING UTC, payload STRING canonical JSON containing explicitly selected source rows and current catalogue classification. The serving manifest records PostgreSQL `txid_current_snapshot()` and cutoff. It is a snapshot record, not a fabricated business event.

## Curated entity tables

Every entity row also contains `release_id STRING` and `observed_at TIMESTAMP`. Key is release plus the business keys below. IDs, amounts and quantities are LONG; status/name/category/currency/pseudonyms are STRING; source created/updated timestamps are TIMESTAMP. Missing frozen historical snapshot fields remain nullable.

| Table | Business key | Source columns |
| --- | --- | --- |
| orders | order_id | customer_key HMAC, status, total_cents, currency, created_at, updated_at |
| order_lines | order_item_id | order_id, product_id, quantity, unit_price_cents, product_name, warehouse_id, publication_version |
| customers | customer_key | HMAC of source customer_id, created_at |
| payments | payment_id | order_id, amount_cents, status, currency, created_at |
| refunds | refund_id | payment_id, amount_cents, status, created_at |
| inventory | product_id + warehouse_id | quantity, reserved_quantity, updated_at |
| warehouses | warehouse_id | name, city, capacity_units |
| classification | productId STRING | Current GraphQL name, category, publicationVersion LONG |

`curated/events` retains the Kafka audit schema, keyed by valid envelope UUID `business_identity`. Duplicate transport records retain their Bronze evidence but have one valid business identity. Conflicting payloads sharing an identity invalidate the curated record and quarantine all conflicting deliveries; Delta history retains earlier classifications. Deduplication has no time expiry. The small local dataset permits full retained-history conflict detection per microbatch.

## Consumption

All consumption entity aggregates include release_id STRING and row_key STRING SHA256 of deterministic aggregate contents. Amount/count/quantity fields are LONG. These are immutable per release.

| Delta table | Grain and values |
| --- | --- |
| overview | One release: order_count, paid_order_count, captured_order_count, gross_cents, refunded_cents, net_cents, line_quantity, sold_quantity |
| revenue_daily | UTC payment date: gross/refunded/net cents, payment_count |
| revenue_monthly / revenue_quarterly | UTC period: gross/refunded/net cents |
| orders_daily | Order date + current status: order_count, ordered_cents |
| orders_monthly / orders_quarterly | Order period + current status: order_count |
| product_performance | Product ID/name/current category + payment date: units_sold, gross/refunded/net cents |
| inventory_snapshot | Product + warehouse: names, city, current category, physical/reserved/available, source_updated_at and observed_at TIMESTAMP |
| customers_daily | Customer creation date: registered_customers |
| customer_activity | HMAC customer_key + payment date: captured_orders |
| order_status | Current status: order_count |

`consumption/manifests`: release_id STRING PK and document STRING JSON with all committed Gold rows, source boundary, financial basis, classification basis and independent reconciliation checks. `consumption/quarterly_reports`: period STRING + release_id STRING composite key, document STRING JSON containing UTC bounds and selected materialized results. `metadata/batch_runs`: job_id STRING PK, kind/status/error_code STRING, completed_at STRING UTC.

## Serving database

Separate `market_analytics.public` owns releases, singleton current_release, pipeline_status, jobs, quarterly_reports and checksum schema_migrations. `data/analytics/*.sql` defines precise PostgreSQL types, constraints and API SELECT grants. Releases contain JSONB documents read back from committed Delta, not unfinished Spark frames. A pointer transaction atomically exposes complete versions. Quarterly keys are period+release; latest is selected by recorded completion time.

Pipeline metrics distinguish Kafka transport rows, unique events, duplicate deliveries, invalid/conflicting rows, late rows, actual broker end offsets, processed end offsets, lag measurement time, Spark batch duration/throughput and successful snapshot verification. A last-known zero lag is never labelled a current measurement without its timestamp. Business source files and migrations remain unchanged.


Phase8 governance catalogue and explicit four-zone lineage: [phase8-data-catalogue.md](phase8-data-catalogue.md). Original financial definitions remain unchanged.
