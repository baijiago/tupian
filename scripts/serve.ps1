# Start the FastAPI app using the local venv
$venvPy = ".venv\\Scripts\\python.exe"
if (!(Test-Path $venvPy)) { Write-Error ".venv not found. Run scripts\\setup.ps1 first."; exit 1 }
& $venvPy -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
