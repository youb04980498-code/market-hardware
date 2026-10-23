$ErrorActionPreference='Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "--- Host tools ---" -ForegroundColor Cyan
foreach($cmd in @('docker','git','node','npm','java','code')){
  if(Get-Command $cmd -ErrorAction SilentlyContinue){ try { & $cmd --version 2>&1 | Select-Object -First 1 }catch { Write-Host "$cmd found" } }
  else { Write-Warning "$cmd not on PATH" }
}
if(Test-Path '.venv\Scripts\python.exe') {
  & .\.venv\Scripts\python.exe --version
  & .\.venv\Scripts\python.exe -c "import fastapi, strawberry, confluent_kafka, pyspark, delta; print('Python libraries import OK')"
} else { Write-Warning 'Virtual environment missing' }
Write-Host "--- Docker services ---" -ForegroundColor Cyan
& docker compose --project-name market-hardware -f docker-compose.yml ps
Write-Host '--- Endpoints ---'
Write-Host 'Postgres localhost:5432 | Mongo localhost:27017 | Kafka 127.0.0.1:9092'
Write-Host 'Redis localhost:6379 | MinIO S3 http://localhost:9000 | MinIO console http://localhost:9001'
Write-Host 'Monitoring optional: Grafana http://localhost:3000 | Prometheus http://localhost:9090'
Write-Host 'NOTE: Container running does not prove streaming/lakehouse or application integration.'
