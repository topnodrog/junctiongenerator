$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "JgcNode.Common.ps1")

$task = Get-ScheduledTask -TaskName $script:JgcNodeTaskName -ErrorAction SilentlyContinue
if ($task) {
  if ($task.State -eq "Running") {
    Stop-ScheduledTask -TaskName $script:JgcNodeTaskName
  }
  Unregister-ScheduledTask -TaskName $script:JgcNodeTaskName -Confirm:$false
}

$activityTask = Get-ScheduledTask -TaskName $script:JgcNodeActivityTaskName -ErrorAction SilentlyContinue
if ($activityTask) {
  if ($activityTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $script:JgcNodeActivityTaskName
  }
  Unregister-ScheduledTask -TaskName $script:JgcNodeActivityTaskName -Confirm:$false
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop $script:JgcNodeShortcutName
if (Test-Path -LiteralPath $shortcutPath) {
  Remove-Item -LiteralPath $shortcutPath
}

$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
$iconPath = Join-Path (Join-Path $localAppData "JunctionGenerator") "jgc-node.ico"
if (Test-Path -LiteralPath $iconPath) {
  Remove-Item -LiteralPath $iconPath
}

Write-Output "JGC Node automatic startup, activity window, and desktop switch were removed."
Write-Output "Chain data and participant identity files were preserved in $(Join-Path (Get-JgcNodePackageRoot) 'data')."
