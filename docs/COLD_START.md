# Cold start from a fresh GitHub clone

This guide separates **initialization** from **restart**. It describes the audited bootstrap order for the tracked V3 seed baseline. It does not claim a successful empty-machine execution. See [validation status](#validation-status-and-known-limitations).

Use Windows PowerShell from the repository root. Requirements: Git, Python 3.12, Docker Desktop/WSL2 running Linux containers, Compose with `include` support, internet access and the resources/ports listed in [README](../README.md#prerequisites). No ZIP, private backup, existing PIM configuration or existing `.local` file is required to reconstruct the tracked baseline. Git does not contain later local orders, authored revisions or private credentials.

## 1. Confirm that this is a new installation

```powershell
docker info --format '{{.OSType}}'
docker ps -a --filter label=com.docker.compose.project=market-hardware
docker volume ls --filter label=com.docker.compose.project=market-hardware
docker volume ls --format '{{.Name}}' | Select-String '^market-hardware_'
git --version
py -3.12 --version
```

The OS must be `linux`; there must be no Market Hardware containers or volumes, including stopped containers and the explicitly named `market-hardware_neo4jdata`. The helper below refuses either condition. Never delete existing volumes to satisfy it. Existing installations must use their original configuration and [restart instructions](../README.md#start-an-existing-installation).

Do not attempt an isolated installation merely by changing `-p`: Neo4j has an explicit volume name, host ports are fixed and several phase scripts force the project name. A true isolated test needs audited overrides for **all** ports, names and script assumptions, or a separate Docker daemon/machine.

## 2. Clone and prepare secrets before Compose

```powershell
git clone https://github.com/youb04980498-code/market-hardware.git
cd market-hardware
Copy-Item .env.example .env
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-cold-start.ps1
if ($LASTEXITCODE -ne 0) { throw 'Environment preparation failed' }
```

The helper inspects Docker before changing files, replaces the five root password placeholders with cryptographically generated secrets and creates `infrastructure/unopim/.env` with a unique PIM database password and shared Laravel `APP_KEY`. It never starts containers, changes a database, deletes storage or prints credentials. It preserves non-placeholder root passwords and refuses an existing PIM environment file. It is a first-install preparation step, not an automatic repair or resume tool.

Both environment files are ignored by Git. Keep secure local copies with backups. Losing a password while retaining initialized volumes requires recovery, not template copying. The PIM app, queue and scheduler must share the same application key. Do not export unrelated Compose variables (`APP_URL`, `DB_PASSWORD`, `COMPOSE_PROJECT_NAME`, service passwords) in the shell: shell overrides can supersede environment-file values.

### Environment ownership

| Values | Populated by | Required stage |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_DB`, `MONGO_ROOT_USER`, `MINIO_ROOT_USER` | Template defaults | Initial stores |
| Root PostgreSQL/MongoDB/MinIO/Grafana/Neo4j passwords | `prepare-cold-start.ps1` | Before containers |
| PIM `DB_PASSWORD`, `APP_KEY`, `APP_CURRENCY`, `APP_URL` | PIM template + preparation | Before PIM first boot |
| Four `PG_<SCHEMA>_PASSWORD` values | Phase 2 migration runner | Before commerce |
| `MONGO_CATALOG_READ_*`, `MONGO_CATALOG_SYNC_*`, `UNOPIM_*` | `configure-catalog.py` | Before catalogue workers |
| JWT/internal keys, outbox password, `DEV_*` credentials | `configure-commerce.py` | Before commerce APIs |
| `KAFKA_ENABLED=1` | `start-commerce.ps1 -WithKafka` | Before streaming |
| Three analytics PostgreSQL passwords, pseudonym key | `configure-analytics.py` | Before analytics |
| Monitoring/log-retention passwords and Mongo exporter URI | `configure-operations.py` | Before monitoring |

Blank generated fields in `.env.example` are intentional; manually filling every blank is unnecessary. Copying the file does not create service roles or PIM integration records. Optional threshold/timer variables use Compose defaults. Host-side clients use fixed loopback endpoints; do not copy container hostnames into the host `.env`.

## 3. Install host Python dependencies and start base infrastructure

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-market.ps1 -SkipPackages -SkipContainers
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
.\.venv\Scripts\python.exe -m pip check
docker compose config --quiet
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-market.ps1 -WithKafka
if ($LASTEXITCODE -ne 0) { throw 'Base infrastructure startup failed' }
```

The installer creates `.venv` and installs `requirements-dev.txt`, preserving the prepared environment files. The documented path assumes prerequisites were installed beforehand; omitting `-SkipPackages` invokes a broader winget installer that also offers optional developer tools. Host Node/Java are not required for this Docker bootstrap.

Base services include operational stores, MinIO and the dedicated UnoPim stack. PostgreSQL initializes `market_db` through its container environment, but business tables are not created until Phase 2. MinIO is compiled from a pinned official source revision when its local image is unavailable. Kafka starts with its own persistent volume.

The pinned UnoPim web entrypoint performs additive migrations, first-run base seeding, Passport key creation, storage linking and initial search indexing. This behavior was inspected in the installed image. Its startup is not the same command as `php artisan unopim:install`; **do not run that installer**, which calls `migrate:fresh`. Queue/scheduler share the storage volume and wait for the web application.

If the first PIM boot exceeds the phase script's 180-second wait, inspect logs; after resolving resource/download problems, a non-destructive extended wait is:

```powershell
docker compose --profile streaming up -d --wait --wait-timeout 600
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
```

Do not continue until required stores and all UnoPim services pass the verifier. That verifier checks authenticated queries and persistent mounts; HTTP readiness alone does not prove product configuration or human accounts exist.

## 4. Initialize business schemas and tracked seed data

```powershell
.\.venv\Scripts\python.exe data/scripts/validate_dataset.py
if ($LASTEXITCODE -ne 0) { throw 'Source fixture validation failed' }
.\.venv\Scripts\python.exe data/seeds/phase2.py all
if ($LASTEXITCODE -ne 0) { throw 'Database migrations/import failed' }
```

The runner creates the database if missing, applies checksum-verified SQL migrations from `data/postgres/schema/migrations/` in version order, creates restricted schema logins and maps source CSVs to actual tables. It loads roles, disabled fixture users, customers, orders/lines, warehouses/stock/reservations, payments/invoices, technical logs and selected historical outbox events. It does not replay every synthetic Kafka scenario as business history.

Exactly four business schemas are used: `auth`, `orders`, `inventory`, `payments`. `monitoring` is technical. MongoDB `market_catalog.products` receives its validator, indexes and stable numeric IDs/prices; Neo4j receives constraints, nodes and only the supplied compatibility edges/provenance. Reimports preserve existing records and fail on conflicting source identities; they are not resets. Do not routinely reimport after product ownership transfers to PIM.

`initialize-data.ps1` additionally runs the Phase 2 integration suite. It is available for deliberate validation but is not needed just to load this baseline. Source fixtures are tracked under `data/`; no ZIP extraction is involved.

## 5. Create a human PIM administrator

After UnoPim is healthy, use its supported interactive user command:

```powershell
docker compose exec unopim php artisan unopim:user:create --admin
```

Enter your name, email, password, locale and timezone when prompted. Store the chosen password privately; do not put it in shell command arguments or Git. This is a separate account from the later OAuth integration robot. The command's availability/options were checked against the pinned running image; creation of a new human account was not executed during this documentation audit.

The old `.local/unopim-admin-credentials.txt` mentioned in historical phase reports belongs to the original installation; a new clone does not contain or automatically recreate it. Do not assume upstream sample/default credentials or an existing human administrator.

## 6. Configure PIM publication and commerce

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-catalog.ps1
if ($LASTEXITCODE -ne 0) { throw 'PIM/catalogue setup failed' }
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-commerce.ps1 -WithKafka
if ($LASTEXITCODE -ne 0) { throw 'Commerce setup failed' }
```

Catalogue setup provisions the integration robot/Passport client through UnoPim application repositories and writes its generated credentials directly into root `.env`. It then uses OAuth-authenticated REST to configure categories, eight component families, attributes and seed products. PIM CSV prices/identities/attributes are explicitly checked against catalogue fixtures. Missing products are created and explicitly approved; existing products are not overwritten or automatically reapproved. The rate-limited import can take several minutes.

The product-sync worker owns publication to MongoDB/Neo4j. It checks approval hashes, publication versions and compatibility rules; it does not invent relationships. Fresh baseline source data has 42 products; later retained development activity may add inactive records or advance versions. Do not expect another machine's local 43rd test product to exist in a fresh clone.

Commerce setup applies additive migrations, creates JWT/internal keys, the restricted outbox worker and separate `DEV_ADMIN_*`, `DEV_CUSTOMER_*`, `DEV_OTHER_*` accounts. Fixture users with disabled hashes remain disabled. It enables real Kafka publication with `KAFKA_ENABLED=1`. All passwords remain local. `COMMERCE_TESTING=0` and `ANALYTICS_TESTING=0` are the new template defaults; fault-injection test campaigns require deliberate opt-in and service recreation.

## 7. Initialize Kafka topics, analytics and the full platform

Create every subscribed topic explicitly: an empty Auth outbox otherwise need not have caused its topic to be auto-created yet.

```powershell
foreach ($topic in @('market.auth.v1','market.orders.v1','market.inventory.v1','market.payments.v1')) {
    docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --create --if-not-exists --topic $topic --partitions 1 --replication-factor 1
    if ($LASTEXITCODE -ne 0) { throw "Topic initialization failed: $topic" }
}
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-analytics.ps1
if ($LASTEXITCODE -ne 0) { throw 'Analytics startup failed' }
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-platform.ps1
if ($LASTEXITCODE -ne 0) { throw 'Platform startup failed' }
```

Topic creation is idempotent and never alters existing partitions or offsets. Single partition/replica matches this one-broker local bootstrap. Original source events eligible for outboxes are published by the outbox worker after acknowledgement; do not separately replay all `events.jsonl` scenarios into live business history.

Analytics configuration creates restricted source-reader/writer/API roles, separate `market_analytics`, its checksum-verified serving migrations and private `market-lakehouse` bucket. Spark starts in the analytics worker container, not on the Windows host. On startup it performs a restricted read-only source snapshot refresh and publishes a serving release before starting Kafka streams. Delta tables, zone prefixes and checkpoints are created by actual processing; empty buckets/folders or old private checkpoints are not prerequisites. Checkpoints start new; Kafka ingestion uses earliest retained offsets, while the order-spike stream starts at latest on its first run. Snapshot reconciliation supplies historical baseline data independently of event completeness.

`start-platform` provisions restricted monitoring/retention roles, builds API/catalogue/analytics/frontend images and starts the catalogue, commerce, streaming, analytics, frontend and monitoring profiles. It reloads gateway/Prometheus/Grafana file configuration for Windows bind mounts. Dashboards, rules and collector configuration are tracked mounts. No AI container is started.

Quarterly reports are generated on demand rather than assuming a private pre-existing report. Once the worker is healthy, optionally request a quarter matching the tracked source dates:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-quarterly-analytics.ps1 -Year 2026 -Quarter 1
```

This creates a retained analytical job/report; an empty quarter is a valid result if there were no qualifying captures. It is not necessary for basic readiness.

## 8. Verify initialization

Run the lightweight checks first:

```powershell
docker compose config --quiet
docker compose --profile catalog --profile commerce --profile streaming --profile analytics --profile frontend --profile monitoring ps -a
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-platform.ps1
.\.venv\Scripts\python.exe scripts/check-contracts.py
docker compose exec -T analytics-worker python -m market_analytics.cli health
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --list
```

All healthchecked long-running services must be healthy. Some monitoring/base services use endpoint/scrape checks instead of Docker healthchecks. `jaeger-storage-init` is a one-shot ownership initializer: exit 0 is expected. The analytics health command requires a successful recent source refresh, not merely a running JVM. Confirm the four `market.*.v1` topics appear.

Inspect persisted initialization using these read-only host commands:

```powershell
.\.venv\Scripts\python.exe -c "from data.seeds.phase2 import pg; c=pg(); print(c.execute('SELECT schema_name FROM information_schema.schemata ORDER BY schema_name').fetchall()); print(c.execute('SELECT version FROM monitoring.schema_migrations ORDER BY version').fetchall()); print(c.execute('SELECT count(*) AS warehouses FROM inventory.warehouses').fetchone()); print(c.execute('SELECT count(*) AS stock_rows FROM inventory.stock').fetchone()); c.close()"
.\.venv\Scripts\python.exe -c "from data.seeds.phase2 import mongo; c=mongo(); print('products',c.market_catalog.products.count_documents({})); print('ready active',c.market_catalog.products.count_documents({'active':True,'sync_state':'READY'})); print('validator',bool(c.market_catalog.command('listCollections',filter={'name':'products'})['cursor']['firstBatch'][0]['options'].get('validator'))); print('indexes',list(c.market_catalog.products.index_information())); c.close()"
.\.venv\Scripts\python.exe -c "from data.seeds.phase2 import query; print(query('MATCH (p:Product) RETURN count(p) AS products')); print(query('MATCH (:Product)-[r:COMPATIBLE]->(:Product) RETURN count(r) AS relationships'))"
.\.venv\Scripts\python.exe -c "from market_catalog.pim import UnoPim; p=UnoPim(); print('PIM products',sum(1 for x in p.products())); p.close()"
.\.venv\Scripts\python.exe -c "from market_analytics.config import connect,s3,bucket; c=connect('api'); print(c.execute('SELECT state,last_success_at FROM pipeline_status').fetchall()); print(c.execute('SELECT release_id FROM current_release').fetchall()); c.close(); r=s3().list_objects_v2(Bucket=bucket(),Delimiter='/'); print('lake prefixes',[p['Prefix'] for p in r.get('CommonPrefixes',[])])"
```

Expected fresh baseline: 42 source products across PIM/MongoDB/Neo4j, 42 ready active published products after sync, 163 supplied compatibility relationships, three source warehouses and 126 source stock rows. Later operational records may increase counts; counts alone do not prove referential integrity. Business/technical schemas, all tracked migration filenames, a Mongo validator/indexes, a recent successful analytics refresh, current serving release and actual lake/checkpoint objects must be present. Fresh human/dev accounts are additional to disabled auth fixtures.

Check APIs/UI without creating commerce data:

```powershell
foreach ($service in @('auth','inventory','orders','payments','analytics')) {
    Invoke-RestMethod "http://localhost:8080/api/$service/health"
    $null = Invoke-WebRequest -UseBasicParsing "http://localhost:8080/api/$service/openapi.json"
}
$body = @{ query = '{ products(page: 1, pageSize: 1) { total items { productId sku } } }' } | ConvertTo-Json
Invoke-RestMethod http://localhost:8080/graphql -Method Post -ContentType application/json -Body $body
```

Open `/`, `/admin`, UnoPim, Grafana and Jaeger using the [access table](../README.md#local-access-and-accounts). Sign into the storefront/admin using the privately saved development accounts; check published products and real analytics freshness. An unauthenticated admin page redirect is expected. Historical seed dates can require a wider dashboard date range. No browser workflow or complete checkout is proven by an HTTP 200 alone.

Full integration/recovery commands are documented in the phase reports. They intentionally create historical records or exercise outages and are not part of this documentation-only verification. Keep their fault controls/assumptions separate from the default non-testing installation.

## Reconstruction boundaries

| Component | Rebuilt from Git / first boot | Requires original state to reproduce later local history |
| --- | --- | --- |
| PostgreSQL business data | Versioned migrations, CSV mapping, selected outboxes; dev roles/accounts separately provisioned | Later orders, payments, refunds, sessions, audit trail |
| MongoDB | Validator, indexes, source products, then PIM-owned approved publication | Later revisions and sync diagnostics |
| Neo4j | Constraints, supplied nodes/edges, validation/provenance; later sync | Later authored compatible revisions |
| UnoPim | Upstream basic seed, REST configuration/product import/approval, new integration; human admin manual | Original app/signing keys, human accounts, author edits/assets, integration secrets |
| Inventory | Source warehouses, quantities and reservations; migrations add operational structures | Later physical changes, reservations and fulfillment |
| Kafka | Fresh broker storage and four topics; original eligible outboxes publish | Original transport offsets, broker history and acknowledgements |
| MinIO / Spark | Bucket provisioning, first snapshot/Delta processing, new checkpoints and serving release | Original Delta history, checkpoints, report versions and job evidence |
| Monitoring / traces | Tracked provisioning/rules/config and fresh persistent storage | Old metrics, alert history and traces |

Use [backup/recovery](phase8-backup-recovery.md) to recover an existing installation's history. A Git clone is a baseline reconstruction, not a backup restore. Automatic retention may remove old technical logs; commercial history is not subject to that purge.

## Failures, resume and safe shutdown

Stop at the first nonzero command. Keep generated environment files and partial volumes. Diagnose `docker compose ps -a` and service logs; resume the failed stage after fixing the cause. Do not rerun preparation: once volumes exist it intentionally refuses. SQL migrations are additive/checksummed; fixture conflicts and an integration record with lost credentials fail closed rather than silently replacing data. PIM integration creation and writing its secret file are not an atomic cross-system transaction: a failure between them needs account/credential recovery.

For retained-state restart use `start-platform.ps1`. For safe stop:

```powershell
docker compose --profile catalog --profile commerce --profile streaming --profile analytics --profile frontend --profile monitoring stop -t 60
```

No volume deletion or destructive cleanup is part of this procedure. See the [troubleshooting table](../README.md#troubleshooting) for Docker/WSL, ports, missing credentials, PIM initialization and Spark resource failures.

## Validation status and known limitations

Audit date: **2026-10-24**. README/phase scripts, root Compose and UnoPim include, environment templates, migration/seed paths, PIM bootstrap/REST mapping, Kafka publication and Spark/MinIO initialization were inspected. The pinned installed UnoPim entrypoint and user-command help were inspected read-only; human-admin creation and empty PIM first boot were not executed.

**A complete empty-volume cold-start test was not performed.** The active Docker daemon already owns populated Market Hardware volumes and fixed host ports; the Docker VM reports about 7.6 GiB RAM. Launching another complete stack here would require isolated names/ports and substantial extra resources. Existing uptime, historical Phase 8 test results and this audit are not cold-start proof.

Focused checks executed for this documentation change:

| Check | Result on 2026-10-24 |
| --- | --- |
| All-profile Compose configuration using both example environments | Passed without using private PIM configuration; this validates syntax/interpolation, not startup |
| Root template completeness | All 24 required root Compose interpolation keys present; generated fields intentionally blank |
| Preparation helper on the real populated daemon | Refused as required; hashes of both private environment files unchanged |
| Preparation helper with isolated temporary files and mocked Docker inventory | Generated root/PIM secrets without printing them; refused repeat setup; original files preserved. This is not a database/cold-start test |
| Documentation references and PowerShell syntax | Local links resolved; all 18 PowerShell blocks and the helper parsed |
| Existing infrastructure verifier | Required services healthy with persistent mounts; PostgreSQL/MongoDB/Neo4j authenticated checks and PIM readiness passed |
| Existing platform verifier | Frontend/catalogue/Prometheus/Grafana/Jaeger endpoints passed; Prometheus targets all up |
| Public contracts and API reads | Six exported OpenAPI contracts matched; five API health/OpenAPI endpoints and the documented GraphQL query passed (42 active products) |
| Existing persisted stores/PIM | 14 business migration files recorded; Mongo validator/indexes present; 43 retained products/PIM/graph nodes, 163 relationships. Existing 74 warehouses/216 stock rows include retained test history, unlike the fresh baseline |
| Existing analytics | Worker health passed; recent successful refresh and current serving release present; four subscribed Kafka topics and lake/checkpoint prefixes present |
| Secret/diff checks | Tracked-candidate local-secret scan and whitespace checks passed |

No full regression campaign, seed replay, database reset or new stack was run for this documentation change. Remaining unverified: empty-store first boot, fresh PIM seeding/admin creation, full ordered bootstrap, initial analytics on new offsets/checkpoints and capacity/timing on a new Windows machine. Host dependency ranges, some image tags and external downloads also limit long-term reproducibility. No V3 requirements, source product identities/SKUs/prices or business logic were changed.
