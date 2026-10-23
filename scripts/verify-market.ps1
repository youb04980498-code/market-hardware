$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$python=Join-Path (Get-Location) '.venv\Scripts\python.exe'
if(-not (Test-Path -LiteralPath $python)){throw 'Project Python environment missing. Run scripts/install-market.ps1 -SkipPackages -SkipContainers.'}
& $python (Join-Path $PSScriptRoot 'verify-infrastructure.py')
if($LASTEXITCODE -ne 0){throw 'Local infrastructure verification failed.'}