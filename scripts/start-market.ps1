[CmdletBinding()]
param([switch]$WithMonitoring)
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if(-not (Test-Path '.env')) { throw '.env missing. Run install-market.ps1 first.' }
$args=@('compose','--project-name','market-hardware','-f','docker-compose.yml')
if($WithMonitoring){$args+=@('--profile','monitoring')}
$args+=@('up','-d','--pull','missing')
& docker @args
if($LASTEXITCODE -ne 0){throw 'Docker failed; inspect Docker Desktop and compose output.'}
& docker compose --project-name market-hardware -f docker-compose.yml ps
