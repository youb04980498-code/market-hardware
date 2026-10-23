[CmdletBinding()]
param([int]$TimeoutSeconds = 900)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& .\.venv\Scripts\python.exe -m market_analytics.cli backfill --timeout $TimeoutSeconds
if ($LASTEXITCODE -ne 0) { throw 'Read-only historical backfill failed.' }
