[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& .\.venv\Scripts\python.exe -c "from market_analytics.config import env; assert env().get('KAFKA_ENABLED') == '1', 'Start commerce with -WithKafka before analytics.'"
if ($LASTEXITCODE -ne 0) { throw 'Existing outbox publication must be enabled using start-commerce.ps1 -WithKafka.' }
& docker compose --profile analytics config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration.' }
# Reuse the existing broker and storage; never recreate commerce or reset volumes.
& docker compose --profile streaming up -d --no-deps --wait --wait-timeout 180 kafka minio
if ($LASTEXITCODE -ne 0) { throw 'Kafka or MinIO unavailable.' }
$storageReady = $false
for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { $null = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9000/minio/health/ready' -TimeoutSec 3; $storageReady = $true; break }
    catch { Start-Sleep -Seconds 1 }
}
if (-not $storageReady) { throw 'MinIO S3 readiness failed.' }
& .\.venv\Scripts\python.exe scripts/configure-analytics.py
if ($LASTEXITCODE -ne 0) { throw 'Analytics provisioning failed.' }
& docker compose --profile analytics build analytics-worker
if ($LASTEXITCODE -ne 0) { throw 'Analytics image build failed.' }
& docker compose --profile analytics up -d --no-deps --wait --wait-timeout 900 analytics-worker analytics
if ($LASTEXITCODE -ne 0) { throw 'Analytics readiness failed; inspect analytics-worker logs.' }
& docker compose restart traefik
if ($LASTEXITCODE -ne 0) { throw 'Gateway reload failed.' }
Write-Host 'Analytics running. Verify with scripts/verify-analytics.ps1.'
