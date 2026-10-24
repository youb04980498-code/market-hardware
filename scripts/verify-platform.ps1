$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration invalid' }
foreach ($uri in @('http://localhost:8080/','http://localhost:8080/health/catalog','http://localhost:9090/-/ready','http://localhost:3000/api/health','http://localhost:16686/api/services')) {
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 5
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw "Unavailable: $uri" }
    Write-Host "PASS $uri"
}
$failed = @('initializing')
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    $targets = Invoke-RestMethod 'http://localhost:9090/api/v1/targets' -TimeoutSec 15
    $failed = @($targets.data.activeTargets | Where-Object { $_.health -ne 'up' })
    if (-not $failed.Count -and $targets.data.activeTargets.Count -gt 0) { break }
    Start-Sleep -Seconds 2
}
if ($failed.Count -or $targets.data.activeTargets.Count -eq 0) { throw "Prometheus has $($failed.Count) failed targets" }
Write-Host 'All Prometheus targets are up. Business workflow tests remain separate.'
