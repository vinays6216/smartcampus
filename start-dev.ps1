# Smart Campus - start backend and frontend for local development.
#
#   .\start-dev.ps1        (or double-click start-dev.cmd)
#
# Opens two windows: backend API (:5000) and frontend (:5173), then opens the app when the API is ready.
# Close a window (or Ctrl+C in it) to stop that server.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }

# 1. Settings files
$missing = @()
if (-not (Test-Path (Join-Path $backend ".env")))  { $missing += "backend\.env   (copy backend\.env.example and fill in DB_* and JWT_SECRET)" }
if (-not (Test-Path (Join-Path $frontend ".env"))) { $missing += "frontend\.env  (copy frontend\.env.example)" }
if ($missing.Count) {
    Write-Host "Missing settings files:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "    $_" }
    exit 1
}

# 2. Packages (first run only)
foreach ($dir in @($backend, $frontend)) {
    if (-not (Test-Path (Join-Path $dir "node_modules"))) {
        Write-Step "Installing packages in $dir (first run only)"
        Push-Location $dir; npm install; Pop-Location
    }
}

# 3. Start both servers in their own windows
function Start-Server($title, $dir, $command) {
    $script = "`$Host.UI.RawUI.WindowTitle = 'Smart Campus - $title'; Set-Location '$dir'; $command"
    Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $script | Out-Null
}
Write-Step "Starting backend on http://localhost:5000"
Start-Server "Backend" $backend "npm run dev"
Write-Step "Starting frontend on http://localhost:5173"
Start-Server "Frontend" $frontend "npm run dev"

# 4. Wait for the API, then open the app
Write-Step "Waiting for the backend (up to 60 seconds)"
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -TimeoutSec 3
        if ($health.success) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if ($ready) {
    Write-Host "Smart Campus is running: http://localhost:5173" -ForegroundColor Green
    Start-Process "http://localhost:5173"
} else {
    Write-Host "The backend did not answer. Check the 'Smart Campus - Backend' window (often: MySQL not running or wrong DB_USER/DB_PASSWORD in backend\.env)." -ForegroundColor Red
}
