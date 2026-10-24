$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose up -d --wait --wait-timeout 180 postgres mongo minio
if ($LASTEXITCODE -ne 0) { throw 'Persistent stores unavailable' }
& .\.venv\Scripts\python.exe scripts\configure-operations.py
if ($LASTEXITCODE -ne 0) { throw 'Operations migration failed' }
& .\.venv\Scripts\python.exe scripts\configure-analytics.py
if ($LASTEXITCODE -ne 0) { throw 'Analytics migration failed' }
docker compose build auth catalog-graphql analytics frontend
if ($LASTEXITCODE -ne 0) { throw 'Platform build failed' }
docker compose --profile catalog --profile commerce --profile streaming --profile analytics --profile frontend --profile monitoring up -d --wait --wait-timeout 600
if ($LASTEXITCODE -ne 0) { throw 'Platform readiness failed; inspect docker compose ps and logs' }
# Windows bind mounts do not reliably notify these file configuration providers.
docker compose restart traefik prometheus grafana
if ($LASTEXITCODE -ne 0) { throw 'Monitoring/gateway configuration reload failed' }
& "$PSScriptRoot\verify-platform.ps1"
