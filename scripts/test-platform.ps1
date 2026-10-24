param([switch]$SkipCommerce)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
# Stateful recovery suites must run serially; all workers are restored in finally.
if (-not $SkipCommerce) { try {
    docker compose --profile analytics --profile monitoring stop analytics-worker log-retention
    if ($LASTEXITCODE -ne 0) { throw 'Could not pause analytics during commerce/seed recovery' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-commerce.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Commerce/seed regression failed' }
} finally {
    docker compose --profile analytics --profile monitoring start analytics-worker log-retention
} }
& .\.venv\Scripts\python.exe -m pytest tests/integration/test_phase6.py -q --tb=short --junitxml=.local/phase8-regression-analytics.xml
if ($LASTEXITCODE -ne 0) { throw 'Analytics regression failed' }
try {
    docker compose --profile analytics stop analytics-worker
    $scriptPath = Join-Path (Get-Location) 'scripts\check-lakehouse-operations.py'
    docker compose --profile analytics run --rm --no-deps -v "${scriptPath}:/app/check-operations.py:ro" analytics-worker python /app/check-operations.py
    if ($LASTEXITCODE -ne 0) { throw 'Isolated Delta/window recovery checks failed' }
} finally {
    docker compose --profile analytics start analytics-worker
}
& .\.venv\Scripts\python.exe -m pytest tests/integration/test_phase8.py -q --tb=short --junitxml=.local/phase8-acceptance.xml
if ($LASTEXITCODE -ne 0) { throw 'Operations acceptance failed' }
Push-Location frontend
try {
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Frontend lint failed' }
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Frontend type check failed' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Frontend unit checks failed' }
    npm run e2e
    if ($LASTEXITCODE -ne 0) { throw 'Browser regression failed' }
} finally {
    Pop-Location
}
& "$PSScriptRoot\verify-platform.ps1"
