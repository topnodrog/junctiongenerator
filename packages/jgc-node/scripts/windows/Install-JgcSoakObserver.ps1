[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [switch]$AtStartup
)

$ErrorActionPreference = 'Stop'
$observerConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
$observerNodePath = (Resolve-Path -LiteralPath $NodePath).Path
$observerConfig = Get-Content -LiteralPath $observerConfigPath -Raw | ConvertFrom-Json
if ($observerConfig.windowId -notmatch '^[a-z0-9][a-z0-9-]{0,79}$') { throw 'Invalid window id' }
if ($observerConfig.participantAddress -notmatch '^1QGC[a-f0-9]{40}$') { throw 'Invalid participant recorder address' }
$observerEnd = if ($observerConfig.expiresAt -is [DateTime]) { [DateTimeOffset]$observerConfig.expiresAt } else { [DateTimeOffset]::Parse($observerConfig.expiresAt) }
$observerRemaining = $observerEnd - [DateTimeOffset]::UtcNow
if ($observerRemaining.TotalMinutes -le 1 -or $observerRemaining.TotalDays -gt 6) { throw 'Observer expiry must be within six days' }
$observerPackageRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$observerScript = Join-Path $observerPackageRoot 'dist\scripts\collect-runner-heartbeat.js'
if (-not (Test-Path -LiteralPath $observerScript)) { throw 'Build the node package before installing the observer' }
$observerTaskName = "JGC Participant Recorder - $($observerConfig.windowId)"
if (Get-ScheduledTask -TaskName $observerTaskName -ErrorAction SilentlyContinue) { throw "Observer task already exists: $observerTaskName" }
$observerAccount = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$observerPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$observerWrapper = Join-Path $PSScriptRoot 'Run-JgcSoakObserver.ps1'
$observerArguments = "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$observerWrapper`" -NodePath `"$observerNodePath`" -ScriptPath `"$observerScript`" -ConfigPath `"$observerConfigPath`""
$observerAction = New-ScheduledTaskAction -Execute $observerPowerShell -Argument $observerArguments -WorkingDirectory $observerPackageRoot
$observerTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration $observerRemaining
$observerTrigger.EndBoundary = $observerEnd.LocalDateTime.ToString('s')
$observerTriggers = @($observerTrigger)
if ($AtStartup) {
  $startupTrigger = New-ScheduledTaskTrigger -AtStartup
  $startupTrigger.EndBoundary = $observerEnd.LocalDateTime.ToString('s')
  $observerTriggers += $startupTrigger
}
$observerPrincipal = New-ScheduledTaskPrincipal -UserId $observerAccount -LogonType $(if ($AtStartup) { 'S4U' } else { 'Interactive' }) -RunLevel Limited
$observerSettings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 1)
$observerTask = New-ScheduledTask -Action $observerAction -Trigger $observerTriggers -Principal $observerPrincipal -Settings $observerSettings -Description 'Saves this JGC participant status every five minutes; does not start, stop, or modify the node.'
Register-ScheduledTask -TaskName $observerTaskName -InputObject $observerTask | Out-Null
Start-ScheduledTask -TaskName $observerTaskName
Write-Output "Installed $observerTaskName until $($observerEnd.ToString('o')). Windows must remain awake."
