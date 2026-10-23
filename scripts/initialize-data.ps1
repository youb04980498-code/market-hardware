[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-market.ps1')
if($LASTEXITCODE -ne 0){throw 'Local infrastructure is not ready.'}
& .\.venv\Scripts\python.exe data/seeds/phase2.py all
if($LASTEXITCODE -ne 0){throw 'Database migration or seed import failed.'}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-data.ps1')
if($LASTEXITCODE -ne 0){throw 'Phase 2 validation failed.'}
