[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$testExit = 1
try {
    # Freeze background business/delivery writes during snapshot regression tests.
    & docker compose --profile catalog --profile commerce stop product-sync checkout-saga outbox-publisher
    if ($LASTEXITCODE -ne 0) { throw 'Could not pause background workers for regression tests.' }
    & .\.venv\Scripts\python.exe -m pytest tests/unit tests/integration/test_phase2.py tests/integration/test_phase3.py -q --tb=short --junitxml=.local/commerce-regressions.xml
    if ($LASTEXITCODE -ne 0) { throw 'Phase 2/3 regression tests failed.' }
    & docker compose --profile catalog --profile commerce up -d --no-deps --wait --wait-timeout 180 product-sync checkout-saga
    if ($LASTEXITCODE -ne 0) { throw 'Workers did not become healthy before recovery tests.' }
    & docker compose --profile streaming up -d --wait --wait-timeout 180 kafka
    if ($LASTEXITCODE -ne 0) { throw 'Kafka is required for the outbox acceptance tests.' }
    & .\.venv\Scripts\python.exe -m pytest tests/integration/test_phase4.py -q --tb=short --junitxml=.local/commerce-phase4.xml
    $testExit = $LASTEXITCODE
} finally {
    & docker compose --profile catalog --profile commerce up -d --no-deps --wait --wait-timeout 180 product-sync checkout-saga outbox-publisher
    if ($LASTEXITCODE -ne 0) { throw 'Background worker recovery after tests failed.' }
}
if ($testExit -ne 0) { throw 'Phase 4 integration/concurrency/recovery tests failed.' }
Write-Host 'PASS: Phase 2/3 regressions and live Phase 4 commerce/Kafka acceptance tests.'
