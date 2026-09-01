$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "JgcNode.Common.ps1")

try {
  $task = Get-ScheduledTask -TaskName $script:JgcNodeTaskName -ErrorAction Stop
  if ($task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $script:JgcNodeTaskName
    Disable-ScheduledTask -TaskName $script:JgcNodeTaskName | Out-Null

    foreach ($attempt in 1..10) {
      Start-Sleep -Milliseconds 500
      if (-not (Get-JgcNodeStatus)) { break }
    }
    if (Get-JgcNodeStatus) {
      throw "Windows stopped the task, but the node is still responding on port 7777."
    }
    Show-JgcNodeMessage -Message "JGC Node is OFF.`nAutomatic startup is disabled." -Icon 64
  } else {
    Enable-ScheduledTask -TaskName $script:JgcNodeTaskName | Out-Null
    Start-ScheduledTask -TaskName $script:JgcNodeTaskName

    $status = $null
    foreach ($attempt in 1..45) {
      Start-Sleep -Seconds 1
      $status = Get-JgcNodeStatus
      if ($status -and $status.running) { break }
    }
    if (-not $status -or -not $status.running) {
      throw "The node did not become ready within 45 seconds."
    }
    Show-JgcNodeMessage -Message "JGC Node is ON.`nNetwork: $($status.network)`nHeight: $($status.height)`nPeers: $($status.peerCount)" -Icon 64
  }
} catch {
  Show-JgcNodeMessage -Message "JGC Node switch failed:`n$($_.Exception.Message)" -Icon 16
  exit 1
}
