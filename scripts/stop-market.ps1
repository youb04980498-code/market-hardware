$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& docker compose --project-name market-hardware -f docker-compose.yml --profile monitoring --profile kafka down
if($LASTEXITCODE -ne 0){throw 'Could not stop the local Compose stack.'}
Write-Host 'Stopped containers. Volumes/data preserved. Do NOT run down -v unless you intend to delete your local data.'
