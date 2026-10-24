$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose --profile world config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration' }
& .\.venv\Scripts\python.exe -m pytest tests/unit/test_world.py tests/integration/test_world_live.py -q --tb=short --junitxml=.local/world-backend.xml
if ($LASTEXITCODE -ne 0) { throw 'World read-only verification failed' }
Write-Host 'PASS world auth, HTTP composition, unchanged business fingerprints, real Kafka consumption and SSE reconnect.'
