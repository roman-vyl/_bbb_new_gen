# Start Research Workbench: BFF (8000) + Vite (5173).
param(
    [switch]$SkipStop,
    [int]$BffPort = 8000,
    [int]$WebPort = 5173
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\workbench-ports.ps1"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

function Write-Err($msg) {
    Write-Host $msg -ForegroundColor Red
    exit 1
}

# --- Preflight ---
try {
    $pyVer = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "python not found" }
    $parts = $pyVer.Trim() -split '\.'
    if ([int]$parts[0] -lt 3 -or ([int]$parts[0] -eq 3 -and [int]$parts[1] -lt 11)) {
        Write-Err "Python 3.11+ required (found $pyVer). Install Python and retry."
    }
} catch {
    Write-Err "Python not found. Install Python 3.11+ and add it to PATH."
}

& python -c "import fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Missing workbench-api deps. Run: pip install -e `".[dev,workbench-api]`""
}

if (-not (Test-Path (Join-Path $RepoRoot "frontend\node_modules"))) {
    Write-Err "frontend/node_modules missing. Run: cd frontend; npm install"
}

# --- Stop ports ---
if (-not $SkipStop) {
    Write-Host "Freeing ports $BffPort, $WebPort..." -ForegroundColor Yellow
    $busy = Stop-PortsWithRetry -Ports @($BffPort, $WebPort)
    if ($busy.Count -gt 0) {
        Write-Err "Port(s) still in use: $($busy -join ', '). Run scripts\stop-workbench.bat or close processes in Task Manager."
    }
}

# --- Start BFF (no --reload: single process per port) ---
$bffCmd = @"
Set-Location '$RepoRoot'
`$Host.UI.RawUI.WindowTitle = 'Research Workbench BFF'
Write-Host 'Research Workbench BFF  http://127.0.0.1:$BffPort' -ForegroundColor Cyan
python -m uvicorn research_api.main:app --host 127.0.0.1 --port $BffPort
"@

Start-Process powershell -ArgumentList @("-NoExit", "-Command", $bffCmd) | Out-Null
Write-Host "Starting BFF on port $BffPort..." -ForegroundColor Yellow

# --- Health-check: new chart-bundle API (ema_fast, not ema_period) ---
$healthOk = $false
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    try {
        $spec = Invoke-RestMethod -Uri "http://127.0.0.1:$BffPort/openapi.json" -TimeoutSec 3
        $params = $spec.paths.'/api/market/chart-bundle'.get.parameters | ForEach-Object { $_.name }
        if ($params -contains 'ema_fast' -and $params -notcontains 'ema_period') {
            $healthOk = $true
            break
        }
        if ($params -contains 'ema_period') {
            Write-Host "Port $BffPort serves OLD BFF (ema_period). Stopping listeners..." -ForegroundColor Red
            Stop-PortsWithRetry -Ports @($BffPort) | Out-Null
            Write-Err "Stale BFF on port $BffPort. Run scripts\stop-workbench.bat, close zombie python in Task Manager, then dev-workbench.bat again."
        }
    } catch {
        # BFF not ready yet
    }
}

if (-not $healthOk) {
    Stop-PortsWithRetry -Ports @($BffPort) | Out-Null
    Write-Err "BFF did not become healthy on port $BffPort within 15s (expected ema_fast in chart-bundle OpenAPI)."
}

Write-Host "BFF OK (chart-bundle: ema_fast / ema_anchor / ema_slow)" -ForegroundColor Green

# --- Start Vite ---
$viteCmd = @"
Set-Location '$RepoRoot\frontend'
`$Host.UI.RawUI.WindowTitle = 'Research Workbench UI'
Write-Host 'Research Workbench UI  http://127.0.0.1:$WebPort' -ForegroundColor Cyan
npm run dev -- --host 127.0.0.1 --port $WebPort --strictPort
"@

Start-Process powershell -ArgumentList @("-NoExit", "-Command", $viteCmd) | Out-Null

Write-Host ""
Write-Host "Workbench started." -ForegroundColor Green
Write-Host "  UI:   http://127.0.0.1:$WebPort/"
Write-Host "  BFF:  http://127.0.0.1:$BffPort/docs"
Write-Host "  Stop: scripts\stop-workbench.bat"
Write-Host "  After backend code changes: stop, then dev again (BFF has no auto-reload)."
