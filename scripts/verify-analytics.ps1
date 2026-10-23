[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& .\.venv\Scripts\python.exe -m pytest tests/integration/test_phase6.py -m 'not recovery' -q --tb=short --junitxml=.local/analytics-integration.xml
if ($LASTEXITCODE -ne 0) { throw 'Live analytics verification failed.' }
