[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
Push-Location frontend
$previousReport = $env:FRONTEND_JUNIT_FILE
try {
    $env:FRONTEND_JUNIT_FILE = '../.local/frontend-smoke.xml'
    & npm.cmd ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Pinned frontend dependency install failed.' }
    & npx.cmd playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }
    & npx.cmd playwright test --grep 'live published products|admin accesses all five|normal cart revalidation'
    if ($LASTEXITCODE -ne 0) { throw 'Live storefront/admin/checkout verification failed.' }
} finally { $env:FRONTEND_JUNIT_FILE = $previousReport; Pop-Location }
Write-Host 'PASS: live storefront, administration and authenticated checkout.'
