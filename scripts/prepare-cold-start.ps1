[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# Run BEFORE creating any Market Hardware containers/volumes. Never rotate a live secret.
$os = & docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $os -ne 'linux') { throw 'Start Docker Desktop in Linux container mode first.' }
$containers = @(& docker ps -aq --filter 'label=com.docker.compose.project=market-hardware')
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing containers.' }
$volumes = @(& docker volume ls --format '{{.Name}}')
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect existing volumes.' }
$ownedVolumes = @(& docker volume ls -q --filter 'label=com.docker.compose.project=market-hardware')
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Compose volume ownership.' }
if ($containers.Count -or $ownedVolumes.Count -or @($volumes | Where-Object { $_ -like 'market-hardware_*' }).Count) {
    throw 'Existing Market Hardware containers/volumes detected. Nothing changed. Use start-platform.ps1 with the original .env; do not regenerate credentials.'
}
if ($env:COMPOSE_PROJECT_NAME -and $env:COMPOSE_PROJECT_NAME -ne 'market-hardware') {
    throw 'Unset the COMPOSE_PROJECT_NAME override; these installation scripts target market-hardware.'
}
function NewLocalSecret {
    $bytes = New-Object byte[] 36
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).Replace('+','-').Replace('/','_').TrimEnd('=')
}
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
$text = [IO.File]::ReadAllText((Join-Path (Get-Location) '.env'))
foreach ($key in @('POSTGRES_PASSWORD','MONGO_ROOT_PASSWORD','MINIO_ROOT_PASSWORD','GRAFANA_ADMIN_PASSWORD','NEO4J_PASSWORD')) {
    $pattern = '(?m)^' + $key + '=REPLACE_' + $key + '\r?$'
    if ($text -notmatch $pattern -and $text -notmatch ('(?m)^' + $key + '=.+$')) { throw "Missing $key in .env; restore the template before first initialization." }
    $text = [regex]::Replace($text, $pattern, ($key + '=' + (NewLocalSecret)))
}
if ($text -notmatch '(?m)^POSTGRES_DB=market_db\r?$') { throw 'POSTGRES_DB must be market_db.' }
$pimPath = Join-Path (Get-Location) 'infrastructure/unopim/.env'
if (Test-Path $pimPath) { throw 'UnoPim .env already exists. Review and retain it; this first-install helper will not replace it.' }
$pim = [IO.File]::ReadAllText((Join-Path (Get-Location) 'infrastructure/unopim/.env.example'))
$pim = $pim.Replace('REPLACE_UNOPIM_DB_PASSWORD', (NewLocalSecret))
$keyBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($keyBytes) } finally { $rng.Dispose() }
$pim = $pim.Replace('APP_KEY=', ('APP_KEY=base64:' + [Convert]::ToBase64String($keyBytes)))
[IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $text, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($pimPath, $pim, [Text.UTF8Encoding]::new($false))
Write-Host 'Prepared ignored root and UnoPim environments. No containers started, databases seeded or passwords displayed.'
Write-Host 'Next: scripts/install-market.ps1 -SkipPackages -SkipContainers; then follow docs/COLD_START.md.'
