[CmdletBinding()]
param([switch]$WithKafka)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path '.env')) { throw 'Local .env is missing; initialize the existing infrastructure first.' }
& .\.venv\Scripts\python.exe -m pip install -r services/commerce-requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Commerce dependency installation failed.' }
& .\.venv\Scripts\python.exe scripts/configure-commerce.py
if ($LASTEXITCODE -ne 0) { throw 'Commerce configuration/migrations failed.' }
$env:KAFKA_ENABLED = if ($WithKafka) { '1' } else { '0' }
& .\.venv\Scripts\python.exe -c "import os; from dotenv import set_key; set_key('.env','KAFKA_ENABLED',os.environ['KAFKA_ENABLED'])"
if ($LASTEXITCODE -ne 0) { throw 'Could not persist the local Kafka mode in .env.' }
& docker compose --profile catalog --profile commerce build auth
if ($LASTEXITCODE -ne 0) { throw 'Commerce image build failed.' }
if ($WithKafka) {
    & docker compose --profile streaming up -d --wait --wait-timeout 180 kafka
    if ($LASTEXITCODE -ne 0) { throw 'Kafka did not become healthy.' }
}
& docker compose --profile catalog --profile commerce up -d --wait --wait-timeout 180 auth inventory orders payments checkout-saga outbox-publisher traefik product-sync
if ($LASTEXITCODE -ne 0) { throw 'Commerce services did not become healthy.' }
# Windows bind-mounted file notifications do not reliably reload Traefik's existing file mount.
& docker compose --profile catalog --profile commerce restart traefik
if ($LASTEXITCODE -ne 0) { throw 'Gateway route reload failed.' }
& docker compose --profile catalog --profile commerce up -d --no-deps --wait --wait-timeout 60 traefik
if ($LASTEXITCODE -ne 0) { throw 'Gateway did not become healthy.' }
Write-Host 'Commerce REST and catalogue: http://localhost:8080 ; credentials remain in .env.'
