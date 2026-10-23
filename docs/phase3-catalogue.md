# Phase 3: UnoPim and the published catalogue

UnoPim is the authoring source. Only approved content is published by the product-sync worker. MongoDB supplies catalogue reads; Neo4j supplies explicit validated pair candidates. Inventory still owns stock. The V3 requirements document is unchanged.

## Run locally

From C:\market-hardware, with the Phase 2 databases initialized:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-catalog.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-catalog.ps1
# Subsequent starts can retain the existing PIM configuration:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-catalog.ps1 -SkipConfiguration
docker compose --profile catalog ps
docker compose --profile catalog logs --tail 50 product-sync
```

The root Compose stack owns catalog-graphql, product-sync and Traefik under the catalog profile. Both Python services run the same pinned image and shared market_catalog package; their entry points are documented in services/catalog-graphql/ and workers/product-sync/. The Python base image and runtime dependency constraints are pinned. Services run as a non-root user. Secrets are read/generated directly in the ignored .env; .env.example is not the runtime source. No Kafka is needed.

The configuration command provisions an integration robot using the installed UnoPim application repositories and Passport client API, then uses actual OAuth-authenticated REST endpoints for categories, attributes, families and products. It does not insert products directly into the PIM database. Existing integration credentials must be retained; configuration never rotates an existing integration or overwrites an existing product. Initial configuration takes a few minutes because it observes UnoPim's rate limit. Authentication uses the configured localhost Host header, including internal Docker requests.

## UnoPim configuration and CSV mapping

Open http://localhost:8000/admin. Existing local admin credentials remain in .local/unopim-admin-credentials.txt. The configuration creates the mh_catalog root, eight child categories and families: CPU, Motherboard, RAM, GPU, SSD, PSU, Case and Cooler. Family codes are mh_cpu, mh_motherboard, mh_ram, mh_gpu, mh_ssd, mh_psu, mh_case and mh_cooler.

The mh_general group contains the business ID, title, description, brand, category, integer-cent price, currency, source revision/version, publication metadata and approval fields. The mh_technical group contains the actual category-specific fields from the seed products. Attribute/family creation is implemented in market_catalog/pim.py configure(). Attributes use UnoPim's supported text/textarea/boolean types; the approval validator enforces numerical types, ranges and required technical fields after conversion.

| V3 source field | UnoPim REST values | Published representation |
| --- | --- | --- |
| sku | values.common.sku | Stable unique SKU |
| product_id | values.common.mh_product_id (unique attribute) | Stable BSON Int64 / Neo4j integer |
| name, brand | mh_name, mh_brand | Catalogue title and brand |
| New description | mh_description | Catalogue description |
| category | mh_category; family mh_<category>; categories array | Category enum |
| price_eur | Explicit Decimal multiplication by 100 -> mh_price_cents | Int64 integer cents |
| currency | mh_currency | Explicit currency |
| active | Product status boolean | active in both projections |
| source_version | mh_source_version | Preserved source version token |
| Initial revision | mh_source_revision=1 | Monotonic ordering independent of opaque source token |
| publication_version | mh_publication_version | Monotonic publication version |
| published_at | mh_published_at | UTC BSON date / graph ISO timestamp |
| attributes_json | Individual mh_spec_<field> attributes | Typed attributes object |
| Nested arrays/maps | JSON text in supported UnoPim attributes | Parsed arrays/maps in MongoDB; maps serialized in Neo4j |
| APPROVED seed status | Validation followed by mh_approval_status and mh_approved_hash | Only approved exact content is eligible |

The importer reads data/pim/products_import.csv and cross-checks its identity, descriptive fields, attributes, price and publication metadata against the initial V3 catalogue fixture. It maps a REST payload; it does not submit the CSV as a purported native import. The existing MongoDB validator is reused for category-specific approval validation. No stock fields are authored in the PIM.

## Create, edit and approve

Create a simple product in UnoPim using the matching mh_* family and category. Set a new stable mh_product_id and SKU, all general fields and the required technical fields. Use source revision 1, publication version 1 and a distinct source version token. Set mh_approval_status=DRAFT. Editing fields in the PIM does not independently edit either published projection.

For an update, increment BOTH mh_source_revision and mh_publication_version, assign a new mh_source_version, edit the values and set approval status DRAFT. Deactivation follows the same workflow with the product status disabled. Then validate and approve the exact current revision:

```powershell
.\.venv\Scripts\python.exe scripts/pim-product.py MH-CPU-1001
# Optional immediate cycle instead of waiting for the 15-second poller:
docker compose --profile catalog run --rm --no-deps product-sync python -m market_catalog.sync --once
```

The approval command validates the category schema, sets a UTC publication timestamp and writes a hash binding the exact approved fields, status and revisions. Any later edit changes the hash, so publication is refused until approval runs again. Merely changing an approval status string is insufficient. This is a local integration approval convention stored as supported UnoPim attributes, not a claim that UnoPim's separate passport-publication feature implements this workflow. Trusted PIM administrators control authoring and approval; separate human reviewer roles/signatures are not implemented.

## Publication and recovery

The worker polls UnoPim REST pages, ignores drafts and validates approval hashes. Stable IDs/SKUs cannot be reassigned. Older source revisions/publication versions, conflicting content for an existing version, reused source tokens for newer versions and backwards publication timestamps are rejected.

MongoDB sync_jobs stores the approved snapshot, digest, version, attempts and state. A renewable-by-cycle global lease serializes individual publications; each has a five-minute lease, longer than the bounded database/graph request timeouts. A product is marked PENDING in MongoDB, its graph node and incident compatibility edges are updated transactionally, and the MongoDB product becomes READY only after Neo4j succeeds. GraphQL hides PENDING products and checks both endpoint versions/digests for compatibility queries. During partial failure a product can temporarily disappear from reads; an old and new revision are never combined as proven compatibility.

Failures remain visible in sync_jobs and sync_errors with safe error codes/reasons. Retries use a bounded exponential delay up to 300 seconds. Each poll makes bounded attempts; retries continue on later polls. A durable approved snapshot can finish even if the current PIM product is now a draft. Superseded jobs cannot roll back newer publications. Duplicate completed publications make no data changes. If both projections are already READY after a crash but the job acknowledgement is missing, replay reconciles the journal to COMPLETE without rewriting projections. Health requires a recent successful cycle with no unresolved jobs.

There is no distributed database transaction. Recovery is an idempotent replay, not atomic cross-store commit. MongoDB accounts separate worker read/write access from API read-only access. Neo4j Community uses the existing local database credential; the API exposes only fixed parameterized read queries, not arbitrary Cypher. Broader Neo4j credential isolation remains an edition limitation.

## Compatibility policy

The only candidates are data/neo4j/compatibility_edges.csv. Eight explicit predicates in market_catalog/graph.py revalidate socket/memory, cooler capacity/mount, RAM capacity/type, form factors, storage ports, GPU clearance, power connectors and cooler clearance against approved current attributes. Unknown data, inactive endpoints and unsupported relation types fail closed. No new candidate pair is guessed. New PIM products have no compatibility edges until explicit evidence/candidates are provided through a future governed rule-input extension.

Changed specifications invalidate all incident existing COMPATIBLE relationships in the same graph transaction before allowed candidates are revalidated. Invalid relationships remain as INVALIDATED evidence rather than being deleted. Relations preserve rule version/provenance and record endpoint publication versions. Pair candidates do not prove a complete PC build or BIOS support. The synthetic V3 fixtures are not vendor-certified.

## GraphQL

Endpoint: http://localhost:8080/graphql through Traefik. Dependency readiness: http://localhost:8080/health/catalog. This phase exposes a loopback HTTP development gateway; production certificates/access controls are outside this local catalogue phase. There is no public mutation or stock field.

```graphql
{
  products(category: CPU, brand: "AMD", minPriceCents: 10000,
           maxPriceCents: 40000, search: "Ryzen", page: 1, pageSize: 10) {
    total page pageSize hasNext
    items { productId sku name priceCents currency attributes sourceVersion publicationVersion publishedAt }
  }
  product(id: "1001") { sku description active }
  productBySku(sku: "MH-CPU-1001") { productId }
  categories
  brands(category: CPU)
  compatibleProducts(productId: "1001", category: MOTHERBOARD) {
    product { productId sku }
    rule ruleVersion provenance validationStatus
  }
}
```

product also accepts productId for the V3 example contract; supply exactly one of id/productId. Products and lookups default to active only; includeInactive:true explicitly includes inactive projections. Pagination sorts by product_id and caps pageSize at 100. Search uses MongoDB text indexes; category/brand/price filters have compound indexes. Categories/brands use all matching active projections, not just one page. GraphQL IDs are strings carrying positive 64-bit business IDs. Attributes use the typed JSON scalar to preserve category-specific structured specifications. The exported schema is data/contracts/catalog.graphql. Traefik limits request bodies; GraphQL limits nesting and masks dependency errors.

## Verification and retained test data

verify-catalog.ps1 pauses the polling worker to avoid races during fault injection, runs the unit checks and Phase 2/3 integration suites, then restarts the worker and checks health. Live tests invoke the actual worker Docker container and query the real gateway, MongoDB, Neo4j and UnoPim. The injected graph outage must leave an ERROR job and hidden product; the next eligible worker cycle must finish it.

Tests retain product 900001 / MH-PHASE3-VERIFY-900001 inactive for auditability and repeatability; they never delete products. They briefly change CPU 1001's socket to verify invalidation and restore its technical attributes through a newer approved revision. Publication versions therefore advance on each verification run; source fixture files stay unchanged. The Phase 2 importer now recognizes worker-owned projections and never overwrites them. Phase 2 regression tests permit new PIM products without Inventory stock and compare current graph projections to current catalogue revisions, while retaining relational integrity and idempotency checks.

No React frontend, payments, Kafka streaming, Spark or AI PC Builder is implemented here.

References checked against the installed source and official documentation: [UnoPim products REST](https://devdocs.unopim.com/3.1/api/product.html), [UnoPim families REST](https://devdocs.unopim.com/3.0/api/attribute_families.html), [Strawberry FastAPI integration](https://strawberry.rocks/docs/integrations/fastapi), [Traefik buffering](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/buffering/).

## Verified local result (2026-10-23)

The live workflow has been executed through the actual UnoPim REST API, worker Docker container, MongoDB, Neo4j and Traefik GraphQL endpoint. The verification suite contains 182 unit cases, 31 Phase 2 regressions and 17 Phase 3 integration cases. It covers both a graph-write failure and a missing final journal acknowledgement. The published catalogue contains 42 active seed products plus one inactive retained verification product, with 163 validated fixture relationships after restoring the CPU specifications. Configuration was rerun successfully without overwriting existing products. Browser click-through authoring and production deployment are not claimed by these REST-driven tests.
