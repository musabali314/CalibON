param(
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot ".venv-calibon\Scripts\python.exe"

if (-not (Test-Path $Python)) {
  throw "CalibON backend environment is missing. Re-run the backend patch installer."
}

Set-Location $ProjectRoot
& $Python -m uvicorn backend.server:app --host 127.0.0.1 --port $Port --reload
