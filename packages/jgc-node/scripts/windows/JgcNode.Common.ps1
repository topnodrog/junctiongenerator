Set-StrictMode -Version Latest

$script:JgcNodeTaskName = "JunctionGenerator JGTC Node"
$script:JgcNodeShortcutName = "JGC Node On-Off.lnk"

function Get-JgcNodePackageRoot {
  return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
}

function Get-JgcNodeExecutable {
  param([string]$NodePath)

  if ($NodePath) {
    $resolved = (Resolve-Path -LiteralPath $NodePath -ErrorAction Stop).Path
  } else {
    $command = Get-Command node.exe -ErrorAction Stop
    $resolved = $command.Source
  }

  $versionText = (& $resolved --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(?<major>\d+)\.(?<minor>\d+)\.') {
    throw "Unable to read the Node.js version from $resolved"
  }

  $major = [int]$Matches.major
  $minor = [int]$Matches.minor
  $supported = ($major -eq 20 -and $minor -ge 19) -or $major -eq 22 -or $major -eq 24
  if (-not $supported) {
    throw "JGC Node requires Node.js 20.19-20.x, 22.x, or 24.x; found $versionText"
  }

  return [pscustomobject]@{
    Path = $resolved
    Version = $versionText
  }
}

function Get-JgcNodeStatus {
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:7777/status" -TimeoutSec 2
  } catch {
    return $null
  }
}

function Show-JgcNodeMessage {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [int]$Icon = 64
  )

  try {
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.Popup($Message, 6, "JGC Node", $Icon)
  } catch {
    Write-Output $Message
  }
}

function New-JgcNodeIcon {
  param([Parameter(Mandatory = $true)][string]$Path)

  Add-Type -AssemblyName System.Drawing
  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $directory -Force | Out-Null

  $size = 64
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $pngStream = New-Object System.IO.MemoryStream
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::FromArgb(13, 17, 23))

    $emerald = [System.Drawing.Color]::FromArgb(31, 217, 166)
    $gold = [System.Drawing.Color]::FromArgb(255, 184, 77)
    $linePen = New-Object System.Drawing.Pen($emerald, 4)
    $ringPen = New-Object System.Drawing.Pen($gold, 3)
    $nodeBrush = New-Object System.Drawing.SolidBrush($gold)
    try {
      $graphics.DrawEllipse($ringPen, 5, 5, 53, 53)
      $graphics.DrawLine($linePen, 19, 20, 32, 32)
      $graphics.DrawLine($linePen, 45, 19, 32, 32)
      $graphics.DrawLine($linePen, 32, 32, 20, 46)
      $graphics.DrawLine($linePen, 32, 32, 46, 45)
      foreach ($point in @(@(16, 17), @(42, 16), @(29, 29), @(17, 43), @(43, 42))) {
        $graphics.FillEllipse($nodeBrush, $point[0], $point[1], 7, 7)
      }
    } finally {
      $linePen.Dispose()
      $ringPen.Dispose()
      $nodeBrush.Dispose()
    }

    $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngStream.ToArray()
  } finally {
    $pngStream.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }

  $iconStream = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($iconStream)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]1)
    $writer.Write([byte]$size)
    $writer.Write([byte]$size)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$pngBytes.Length)
    $writer.Write([uint32]22)
    $writer.Write($pngBytes)
    [System.IO.File]::WriteAllBytes($Path, $iconStream.ToArray())
  } finally {
    $writer.Dispose()
    $iconStream.Dispose()
  }
}
