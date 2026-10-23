[CmdletBinding()]
param([switch]$WithRecovery)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$testArguments = @('-m','pytest','tests/unit/test_analytics.py','tests/integration/test_phase6.py','-q','--tb=short','--junitxml=.local/analytics-tests.xml')
if (-not $WithRecovery) { $testArguments += @('-m','not recovery') }
& .\.venv\Scripts\python.exe @testArguments
if ($LASTEXITCODE -ne 0) { throw 'Analytics tests failed.' }
