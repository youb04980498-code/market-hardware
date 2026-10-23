# Market Hardware local development installer — Windows 10/11 / PowerShell 5.1+
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\install-market.ps1
# Optional: -SkipPackages | -SkipContainers | -WithMonitoring
[CmdletBinding()]
param(
  [switch]$SkipPackages,
  [switch]$SkipContainers,
  [switch]$WithMonitoring
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function HasCommand([string]$name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function InstallWinget([string]$id) {
    Write-Host "\n>>> Checking $id" -ForegroundColor Cyan
    & winget list --id $id --exact --accept-source-agreements | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "Already installed: $id"; return }
    & winget install --id $id --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { Write-Warning "winget failed for $id (exit $LASTEXITCODE). Install manually before continuing if needed." }
}
function EnvPassword([int]$length=24) {
    $alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $bytes = New-Object byte[] ($length)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    -join ($bytes | ForEach-Object { $alphabet[ $_ % $alphabet.Length ] })
}

Write-Host '=== MARKET HARDWARE LOCAL SETUP ===' -ForegroundColor Green
if (-not $SkipPackages) {
    if (-not (HasCommand 'winget')) { throw 'Windows Package Manager (winget) is missing. Install App Installer from Microsoft Store first.' }
    $packages = @('Git.Git','Python.Python.3.12','OpenJS.NodeJS.LTS','Microsoft.VisualStudioCode','EclipseAdoptium.Temurin.17.JDK','Docker.DockerDesktop')
    foreach($p in $packages){ InstallWinget $p }
    Write-Host "\nInstalled/check attempted. Refreshing PATH for newly installed tools." -ForegroundColor Yellow
}

$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path

if (-not (Test-Path '.env')) {
    $values = @{
      'POSTGRES_PASSWORD' = (EnvPassword)
      'MONGO_ROOT_PASSWORD' = (EnvPassword)
      'MINIO_ROOT_PASSWORD' = (EnvPassword)
      'GRAFANA_ADMIN_PASSWORD' = (EnvPassword)
    }
    $template = Get-Content '.env.example' -Raw
    foreach($k in $values.Keys){ $template = $template.Replace("REPLACE_$k",$values[$k]) }
    [System.IO.File]::WriteAllText((Join-Path $root '.env'),$template,[System.Text.UTF8Encoding]::new($false))
    Write-Host 'Generated local secrets in .env (not committed).'
} else { Write-Host 'Preserving existing .env.' }

$python = $null
if (HasCommand 'py') { & py -3.12 --version 2>$null; if($LASTEXITCODE -eq 0){$python = 'py'} }
if (-not $python -and (HasCommand 'python')) { $python = 'python' }
if ($python) {
   if (-not (Test-Path '.venv\Scripts\python.exe')) {
       if ($python -eq 'py') { & py -3.12 -m venv .venv } else { & python -m venv .venv }
       if ($LASTEXITCODE -ne 0) { throw 'Could not create Python virtual environment.' }
   }
   & .\.venv\Scripts\python.exe -m pip install --upgrade pip
   if ($LASTEXITCODE -ne 0) { throw 'Could not update pip.' }
   & .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
   if ($LASTEXITCODE -ne 0) { throw 'Python dependencies installation failed.' }
   Write-Host 'Python virtual environment ready.' -ForegroundColor Green
} else {
   Write-Warning 'Python 3.12 not yet on PATH. Reopen PowerShell, then rerun with -SkipPackages.'
}

if (-not $SkipContainers) {
    if (-not (HasCommand 'docker')) {
       Write-Warning 'Docker CLI unavailable. Start Docker Desktop, reopen PowerShell and run .\scripts\start-market.ps1.'
    } else {
       & docker info *> $null
       if ($LASTEXITCODE -ne 0) {
           Write-Warning 'Docker Engine is not running. Start Docker Desktop (Linux containers) then run .\scripts\start-market.ps1.'
       } else {
           $args = @('compose','--project-name','market-hardware','-f','docker-compose.yml')
           if ($WithMonitoring) { $args += @('--profile','monitoring') }
           $args += @('up','-d','--pull','missing')
           & docker @args
           if ($LASTEXITCODE -ne 0) { throw 'Docker compose failed. Check port conflicts and Docker Desktop resources.' }
           Write-Host 'Containers requested. Run .\scripts\verify-market.ps1 to inspect readiness.' -ForegroundColor Green
       }
    }
}
Write-Host "\nNext: .\scripts\verify-market.ps1" -ForegroundColor Green
Write-Host 'Optional: .\scripts\start-market.ps1 -WithMonitoring'
