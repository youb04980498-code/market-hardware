[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
function Get-PendingSagaCount {
    $code = @'
from market_commerce.common import connection
with connection('orders') as conn:
    print(conn.execute("SELECT count(*) AS n FROM orders.sagas WHERE step<>'DONE'").fetchone()['n'])
'@
    $result = $code | & .\.venv\Scripts\python.exe -
    if ($LASTEXITCODE -ne 0) { throw 'Could not check pending Sagas.' }
    return [int]$result
}
if ((Get-PendingSagaCount) -ne 0) { throw 'Pending Sagas must reconcile before rollback; no data has been changed.' }
& docker compose --profile catalog --profile commerce stop orders
if ($LASTEXITCODE -ne 0) { throw 'Could not stop new checkout requests.' }
if ((Get-PendingSagaCount) -ne 0) {
    & docker compose --profile catalog --profile commerce up -d --no-deps --wait orders
    throw 'A checkout started before shutdown; Orders was restored so it can reconcile. Retry rollback after completion.'
}
& docker compose --profile catalog --profile commerce stop checkout-saga outbox-publisher auth inventory payments
if ($LASTEXITCODE -ne 0) { throw 'Could not stop commerce services.' }
Write-Host 'Commerce deployment stopped. Phase 3 and every migration/data record remain intact. Re-enable with start-commerce.ps1.'
