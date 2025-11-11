param(
  [string]$Py311 = 'C:\\Users\\86147\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
)
$ErrorActionPreference = 'Stop'
Write-Host "[setup] Using Python:" $Py311
if (!(Test-Path $Py311)) {
  Write-Host "[setup] Provided Python path not found. Fallback to 'python' on PATH" -ForegroundColor Yellow
  $Py311 = 'python'
}
# Create venv
Write-Host "[setup] Creating venv at .venv"
& $Py311 -m venv .venv
if ($LASTEXITCODE -ne 0) { throw "venv creation failed" }
$venvPy = Join-Path (Resolve-Path '.venv').Path 'Scripts\\python.exe'
Write-Host "[setup] Upgrading pip"
& $venvPy -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
Write-Host "[setup] Installing requirements.txt"
& $venvPy -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
Write-Host "[setup] Done. To run: .\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000" -ForegroundColor Green
