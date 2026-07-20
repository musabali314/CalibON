$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPython = Join-Path $ProjectRoot ".venv-calibon\Scripts\python.exe"

if (-not (Test-Path $BackendPython)) {
  throw "The CalibON backend environment is missing. Re-run the native-backend patch installer."
}

$BackendCommand = @"
Set-Location '$ProjectRoot'
& '$BackendPython' -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
"@

Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $BackendCommand
Start-Sleep -Seconds 2
Set-Location $ProjectRoot
npm run dev -- --force
