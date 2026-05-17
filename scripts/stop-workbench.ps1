# Stop Research Workbench dev servers (BFF + Vite).
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\workbench-ports.ps1"

$ports = @(8000, 5173, 8001)
Write-Host "Stopping listeners on ports: $($ports -join ', ')..." -ForegroundColor Yellow

$busy = Stop-PortsWithRetry -Ports $ports
if ($busy.Count -gt 0) {
    Write-Host "Still listening: $($busy -join ', '). Close processes in Task Manager and run again." -ForegroundColor Red
    exit 1
}

Write-Host "Workbench stopped." -ForegroundColor Green
