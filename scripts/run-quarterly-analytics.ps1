[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateRange(2000,2100)][int]$Year,
      [Parameter(Mandatory=$true)][ValidateRange(1,4)][int]$Quarter,
      [int]$TimeoutSeconds = 900)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& .\.venv\Scripts\python.exe -m market_analytics.cli quarterly --year $Year --quarter $Quarter --timeout $TimeoutSeconds
if ($LASTEXITCODE -ne 0) { throw 'Quarterly materialization failed.' }
