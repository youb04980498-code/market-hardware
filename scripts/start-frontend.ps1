[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& docker compose --profile catalog --profile commerce --profile frontend config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration is invalid.' }
foreach ($service in @('auth','orders','inventory','payments')) {
    try { $null = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/$service/health" -TimeoutSec 15 }
    catch { throw 'Start the local backend first with scripts/start-commerce.ps1 (optionally -WithKafka).' }
}
& docker compose --profile frontend build frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend production image build failed.' }
& docker compose --profile frontend up -d --no-deps --wait --wait-timeout 120 frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend container is not healthy.' }
& docker compose --profile commerce restart traefik
if ($LASTEXITCODE -ne 0) { throw 'Gateway reload failed.' }
$ready = $false
for ($attempt=0; $attempt -lt 20; $attempt++) {
    try {
        $page = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/shop' -TimeoutSec 10
        if ($page.StatusCode -eq 200 -and $page.Content -match 'Market Hardware') { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw 'Frontend deep link did not load through Traefik.' }
Write-Host 'PASS: production frontend healthy; http://localhost:8080/ and /admin are available.'
