[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& .\.venv\Scripts\python.exe -m pytest tests/integration/test_phase2.py -q --tb=short
if($LASTEXITCODE -ne 0){throw 'Live database validation failed.'}
