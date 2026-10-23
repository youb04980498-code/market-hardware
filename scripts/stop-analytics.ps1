[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& docker compose --profile analytics stop -t 60 analytics analytics-worker
if ($LASTEXITCODE -ne 0) { throw 'Analytics stop failed.' }
Write-Host 'Analytics stopped; commerce, broker, storage and all persisted data retained.'
