# Shared port cleanup for Research Workbench (Windows).
# Dot-source: . "$PSScriptRoot\workbench-ports.ps1"

function Test-PortListening {
    param([Parameter(Mandatory = $true)][int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $conn -and @($conn).Count -gt 0
}

function Stop-PortListeners {
    param([Parameter(Mandatory = $true)][int]$Port)

    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) {
        return
    }

    $procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
        if ($procId -le 0) {
            continue
        }
        & taskkill /PID $procId /F /T 2>$null | Out-Null
    }
}

function Stop-PortsWithRetry {
    param(
        [Parameter(Mandatory = $true)][int[]]$Ports,
        [int]$MaxAttempts = 2
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        foreach ($port in $Ports) {
            Stop-PortListeners -Port $port
        }
        if ($attempt -lt $MaxAttempts) {
            Start-Sleep -Seconds 1
        }
    }

    $stillBusy = @($Ports | Where-Object { Test-PortListening -Port $_ })
    return $stillBusy
}
