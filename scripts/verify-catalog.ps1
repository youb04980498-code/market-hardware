[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
# The tests own synchronization while injecting a graph outage; avoid racing the poller.
& docker compose --profile catalog stop product-sync
if ($LASTEXITCODE -ne 0) { throw 'Could not pause the synchronization poller.' }
try {
    & .\.venv\Scripts\python.exe -m pytest tests/unit/test_catalog.py tests/integration/test_phase2.py tests/integration/test_phase3.py -q --tb=short
    if ($LASTEXITCODE -ne 0) { throw 'Catalogue validation failed.' }
} finally {
    & docker compose --profile catalog up -d --no-deps --wait --wait-timeout 180 product-sync
    if ($LASTEXITCODE -ne 0) { throw 'Synchronization poller did not become healthy after validation.' }
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
if ($LASTEXITCODE -ne 0) { throw 'Infrastructure connectivity validation failed.' }
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health/catalog'
if ($health.status -ne 'ok') { throw 'Catalogue gateway health check failed.' }
Write-Host 'PASS: Phase 3 live workflow, regression tests, catalogue gateway and infrastructure.'
