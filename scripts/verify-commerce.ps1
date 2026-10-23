[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& .\.venv\Scripts\python.exe -m pytest tests/integration/test_phase4.py::test_gateway_openapi_health_and_catalogue tests/integration/test_phase4.py::test_successful_checkout_and_price_snapshot -q --tb=short
if ($LASTEXITCODE -ne 0) { throw 'Live commerce verification failed.' }
Write-Host 'PASS: health, routes, authentication, checkout, payment, stock finalization, outbox and catalogue preservation.'
