[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$ScriptPath,
  [Parameter(Mandatory = $true)][string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
& $NodePath $ScriptPath --config $ConfigPath
exit $LASTEXITCODE
