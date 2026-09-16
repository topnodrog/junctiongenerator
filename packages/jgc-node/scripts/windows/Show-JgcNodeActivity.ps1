$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "JgcNode.Common.ps1")

$Host.UI.RawUI.WindowTitle = "JGC Node Activity"
$refreshSeconds = 2

while ($true) {
  Clear-Host
  Write-Host "JGC Node Activity" -ForegroundColor Cyan
  Write-Host "=================" -ForegroundColor DarkCyan
  Write-Host "Live local status; refreshes every $refreshSeconds seconds."
  Write-Host ""

  $status = Get-JgcNodeStatus
  if ($status -and $status.running) {
    $height = if ($null -eq $status.height) { "-" } else { $status.height }
    $peers = if ($null -eq $status.peerCount) { "-" } else { $status.peerCount }
    $producer = if ($status.producer -and $status.producer.enabled) { "enabled" } else { "validator/back-checker" }
    $startedAt = if ($null -eq $status.startedAt) { "-" } else {
      [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$status.startedAt).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
    }

    Write-Host "Status:  RUNNING" -ForegroundColor Green
    Write-Host "Network: $($status.network)"
    Write-Host "Height:  $height"
    Write-Host "Peers:   $peers"
    Write-Host "Role:    $producer"
    Write-Host "Started: $startedAt"
    Write-Host "Uptime:  $($status.uptimeSec) seconds"
    if ($status.producer -and $status.producer.enabled) {
      Write-Host "Blocks:  $($status.producer.producedBlocks) produced"
      if ($status.producer.lastError) {
        Write-Host "Last error: $($status.producer.lastError)" -ForegroundColor Yellow
      }
    }
    Write-Host ""
    Write-Host "Activity endpoint: http://127.0.0.1:7777/status" -ForegroundColor DarkGray
  } else {
    Write-Host "Status:  STARTING or OFFLINE" -ForegroundColor Yellow
    Write-Host "The node has not answered its local status endpoint yet."
    Write-Host ""
    Write-Host "The window will keep watching for activity." -ForegroundColor DarkGray
  }

  Write-Host ""
  Write-Host "Press Ctrl+C to close this activity window." -ForegroundColor DarkGray
  Start-Sleep -Seconds $refreshSeconds
}
