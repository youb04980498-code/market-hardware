[CmdletBinding()]
param([switch]$SkipBackend)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not $SkipBackend) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-commerce.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Backend regression checks failed.' }
}
Push-Location frontend
try {
    & npm.cmd ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency install failed.' }
    foreach ($command in @('lint','typecheck','test','build')) {
        & npm.cmd run $command
        if ($LASTEXITCODE -ne 0) { throw "Frontend $command failed." }
    }
    & npm.cmd audit --audit-level=moderate
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency audit failed.' }
    & npx.cmd playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }
    & npx.cmd playwright test
    if ($LASTEXITCODE -ne 0) { throw 'Live frontend browser checks failed.' }
} finally { Pop-Location }
Write-Host 'PASS: frontend static, component, live API and browser checks.'
