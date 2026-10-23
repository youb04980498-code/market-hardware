[CmdletBinding()]
param([switch]$WithMonitoring, [switch]$WithKafka)
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if(-not (Test-Path '.env')) { throw '.env missing. Run install-market.ps1 first.' }
$args=@('compose','--project-name','market-hardware','-f','docker-compose.yml')
if($WithMonitoring){$args+=@('--profile','monitoring')}
if($WithKafka){$args+=@('--profile','kafka')}
else {
  & docker compose --project-name market-hardware -f docker-compose.yml --profile kafka stop kafka
  if($LASTEXITCODE -ne 0){throw 'Could not stop deferred Kafka service.'}
}
$args+=@('up','-d','--pull','missing','--wait','--wait-timeout','180')
& docker @args
if($LASTEXITCODE -ne 0){throw 'Docker failed; inspect Docker Desktop and compose output.'}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-market.ps1')
if($LASTEXITCODE -ne 0){throw 'Infrastructure connectivity verification failed.'}
& docker compose --project-name market-hardware -f docker-compose.yml ps
