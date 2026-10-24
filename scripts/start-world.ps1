[CmdletBinding()]
param([switch]$WithFrontend)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ((git branch --show-current) -ne '3d-test-branch') { throw 'This experiment must run from 3d-test-branch.' }
if (-not (Test-Path .env)) { throw 'Initialize the retained platform first; see docs/COLD_START.md. Do not generate new credentials for existing volumes.' }
& .\.venv\Scripts\python.exe -c "from dotenv import dotenv_values; assert dotenv_values('.env').get('KAFKA_ENABLED') == '1', 'Enable existing publication using scripts/start-commerce.ps1 -WithKafka first'"
if ($LASTEXITCODE -ne 0) { throw 'The existing outbox publisher must be enabled before starting the live world.' }
docker compose --profile world config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration invalid' }
docker compose up -d --wait --wait-timeout 180 postgres mongo neo4j
if ($LASTEXITCODE -ne 0) { throw 'Existing stores unavailable' }
docker compose --profile commerce build auth
if ($LASTEXITCODE -ne 0) { throw 'Read endpoint image build failed' }
docker compose --profile commerce --profile catalog up -d --no-deps --wait --wait-timeout 180 auth inventory payments orders catalog-graphql traefik
if ($LASTEXITCODE -ne 0) { throw 'Existing read APIs unavailable' }
docker compose --profile analytics up -d --no-deps --wait --wait-timeout 180 analytics
if ($LASTEXITCODE -ne 0) { throw 'Analytics serving API unavailable; initialize Phase 6 first' }
docker compose --profile streaming up -d --no-deps --wait --wait-timeout 180 kafka
if ($LASTEXITCODE -ne 0) { throw 'Kafka unavailable' }
foreach($topic in @('market.orders.v1','market.inventory.v1','market.payments.v1')) {
    docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --create --if-not-exists --topic $topic --partitions 1 --replication-factor 1
    if ($LASTEXITCODE -ne 0) { throw 'Topic availability failed' }
}
docker compose --profile commerce up -d --no-deps --wait --wait-timeout 180 checkout-saga outbox-publisher
if ($LASTEXITCODE -ne 0) { throw 'Existing commerce workers unavailable' }
docker compose --profile world up -d --build --no-deps --wait --wait-timeout 180 world
if ($LASTEXITCODE -ne 0) { throw '3D world bridge failed' }
docker compose restart traefik
if ($LASTEXITCODE -ne 0) { throw 'Gateway reload failed' }
if ($WithFrontend) {
    docker compose --profile frontend up -d --build --no-deps --wait --wait-timeout 180 frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build/start failed' }
}
Write-Host 'World API: http://localhost:8080/api/world/docs'
Write-Host 'Vite: http://127.0.0.1:5173/admin/3d-world (npm run dev in frontend)'
Write-Host 'Docker frontend, when enabled: http://localhost:8080/admin/3d-world'
Write-Host 'No seed, reset or 3D-originated business writes. Existing commerce workers may resume pending work.'
