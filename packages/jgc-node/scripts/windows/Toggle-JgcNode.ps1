$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "JgcNode.Common.ps1")

try {
  $task = Get-ScheduledTask -TaskName $script:JgcNodeTaskName -ErrorAction Stop
  $activityTask = Get-ScheduledTask -TaskName $script:JgcNodeActivityTaskName -ErrorAction SilentlyContinue
  $existingStatus = Get-JgcNodeStatus
  $turningOff = $task.State -eq "Running" -or `
    ($activityTask -and $activityTask.State -eq "Running") -or `
    ($existingStatus -and $existingStatus.running)

  if ($turningOff) {
    if ($activityTask -and $activityTask.State -eq "Running") {
      Stop-ScheduledTask -TaskName $script:JgcNodeActivityTaskName
    }
    if ($task.State -eq "Running") {
      Stop-ScheduledTask -TaskName $script:JgcNodeTaskName
    }
    Disable-ScheduledTask -TaskName $script:JgcNodeTaskName | Out-Null
    if ($activityTask) {
      Disable-ScheduledTask -TaskName $script:JgcNodeActivityTaskName | Out-Null
    }

    foreach ($attempt in 1..10) {
      Start-Sleep -Milliseconds 500
      if (-not (Get-JgcNodeStatus)) { break }
    }
    if (Get-JgcNodeStatus) {
      throw "Windows stopped the task, but the node is still responding on port 7777."
    }
    $activityMessage = if ($activityTask) { "`nThe activity window is closed." } else { "" }
    Show-JgcNodeMessage -Message "JGC Node is OFF.`nAutomatic startup is disabled.$activityMessage" -Icon 64
  } else {
    if ($existingStatus -and $existingStatus.running) {
      throw "A JGC Node is already responding on port 7777 outside the automatic startup task."
    }

    Enable-ScheduledTask -TaskName $script:JgcNodeTaskName | Out-Null
    if ($activityTask) {
      Enable-ScheduledTask -TaskName $script:JgcNodeActivityTaskName | Out-Null
    }
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

    $activityMessage = ""
    if ($activityTask) {
      Start-ScheduledTask -TaskName $script:JgcNodeActivityTaskName
      $activityMessage = "`nA live activity window is open."
    }
    Show-JgcNodeMessage -Message "JGC Node is ON.`nNetwork: $($status.network)`nHeight: $($status.height)`nPeers: $($status.peerCount)$activityMessage" -Icon 64
  }
} catch {
  Show-JgcNodeMessage -Message "JGC Node switch failed:`n$($_.Exception.Message)" -Icon 16
  exit 1
}
