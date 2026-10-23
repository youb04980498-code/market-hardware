[CmdletBinding()]
param([switch]$SkipConfiguration)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-market.ps1
if ($LASTEXITCODE -ne 0) { throw 'Start the local infrastructure with scripts/start-market.ps1 first.' }
& .\.venv\Scripts\python.exe -m pip install -r services/catalog-graphql/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Catalogue dependencies failed.' }
if (-not $SkipConfiguration) {
    & .\.venv\Scripts\python.exe scripts/configure-catalog.py
    if ($LASTEXITCODE -ne 0) { throw 'UnoPim configuration failed.' }
}
& docker compose --profile catalog build catalog-graphql
if ($LASTEXITCODE -ne 0) { throw 'Catalogue image build failed.' }
& docker compose --profile catalog up -d --wait --wait-timeout 180 catalog-graphql traefik product-sync
if ($LASTEXITCODE -ne 0) { throw 'Catalogue services did not become healthy.' }
Write-Host 'GraphQL: http://localhost:8080/graphql'
