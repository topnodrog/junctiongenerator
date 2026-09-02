[CmdletBinding()]
param(
  [string]$NodePath,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "JgcNode.Common.ps1")

$packageRoot = Get-JgcNodePackageRoot
$node = Get-JgcNodeExecutable -NodePath $NodePath
$npmPath = Join-Path (Split-Path -Parent $node.Path) "npm.cmd"
if (-not (Test-Path -LiteralPath $npmPath)) {
  throw "npm.cmd was not found next to $($node.Path)"
}

Write-Output "Building JGC Node with Node.js $($node.Version)..."
Push-Location $packageRoot
try {
  & $npmPath run build
  if ($LASTEXITCODE -ne 0) {
    throw "JGC Node build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$existingTask = Get-ScheduledTask -TaskName $script:JgcNodeTaskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.State -eq "Running") {
  Stop-ScheduledTask -TaskName $script:JgcNodeTaskName
  foreach ($attempt in 1..20) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-JgcNodeStatus)) { break }
  }
}

$existingStatus = Get-JgcNodeStatus
if ($existingStatus -and $existingStatus.running) {
  throw "A JGC Node is already using port 7777. Stop it before installing automatic startup."
}

$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = @(
  "dist/scripts/testnet-node.js",
  "--seed", "wss://seed-a.junctiongenerator.net",
  "--seed", "wss://jgc-testnet-seed-b.fly.dev"
) -join " "

$action = New-ScheduledTaskAction -Execute $node.Path -Argument $arguments -WorkingDirectory $packageRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "Runs the outbound-only JGTC validator after Windows sign-in."

if ($existingTask) {
  Unregister-ScheduledTask -TaskName $script:JgcNodeTaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $script:JgcNodeTaskName -InputObject $task | Out-Null

# Register-ScheduledTask inherits the elevated installer's task ACL and can
# leave the limited runner account with read-only access.  The desktop toggle
# runs as that account, so explicitly grant it control of this task only.
$accountSid = (New-Object System.Security.Principal.NTAccount($account)).Translate(
  [System.Security.Principal.SecurityIdentifier]
).Value
$scheduleService = New-Object -ComObject "Schedule.Service"
$scheduleService.Connect()
$registeredTask = $scheduleService.GetFolder("\").GetTask($script:JgcNodeTaskName)
$taskSddl = $registeredTask.GetSecurityDescriptor(0xF)
$readOnlyAce = "(A;;FR;;;$accountSid)"
$fullAccessAce = "(A;;FA;;;$accountSid)"
if ($taskSddl.Contains($readOnlyAce)) {
  $registeredTask.SetSecurityDescriptor($taskSddl.Replace($readOnlyAce, $fullAccessAce), 0)
} elseif (-not $taskSddl.Contains($fullAccessAce)) {
  throw "Unable to grant $account control of the automatic startup task."
}

$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
$controlDirectory = Join-Path $localAppData "JunctionGenerator"
$iconPath = Join-Path $controlDirectory "jgc-node.ico"
New-JgcNodeIcon -Path $iconPath

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop $script:JgcNodeShortcutName
$shortcutTarget = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$toggleScript = Join-Path $PSScriptRoot "Toggle-JgcNode.ps1"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $shortcutTarget
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$toggleScript`""
$shortcut.WorkingDirectory = $packageRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "Turn the JGTC validator node on or off"
$shortcut.Save()

if (-not $NoStart) {
  Start-ScheduledTask -TaskName $script:JgcNodeTaskName
  $status = $null
  foreach ($attempt in 1..30) {
    Start-Sleep -Seconds 1
    $status = Get-JgcNodeStatus
    if ($status -and $status.running) { break }
  }
  if (-not $status -or -not $status.running) {
    throw "The scheduled task was installed, but the JGC Node status endpoint did not become ready."
  }
  Write-Output "JGC Node is running on $($status.network) at height $($status.height)."
}

Write-Output "Automatic startup task installed: $($script:JgcNodeTaskName)"
Write-Output "Desktop switch installed: $shortcutPath"
Write-Output "Runtime: $($node.Path) ($($node.Version))"
