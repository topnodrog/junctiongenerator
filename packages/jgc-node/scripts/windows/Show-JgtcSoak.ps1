param([Parameter(Mandatory=$true)][string]$AppRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$app = (Resolve-Path -LiteralPath $AppRoot).Path
$dir = Join-Path $env:LOCALAPPDATA 'JunctionGenerator\participant-soak'
$null = New-Item -ItemType Directory -Force -Path $dir
$prefs = Join-Path $dir 'pause-settings.json'
$view = Join-Path $dir 'session-status.json'
$seedFile = Join-Path $dir 'seed-url.txt'
$form = New-Object Windows.Forms.Form
$form.Text = 'JGTC participant'
$form.StartPosition = 'CenterScreen'
$form.AutoScaleMode = 'Dpi'
$form.ClientSize = [Drawing.Size]::new(500,358)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = [Drawing.Font]::new('Segoe UI',10)
function Add-Control($kind, $text, $x, $y, $w, $h) {
    $control = New-Object "Windows.Forms.$kind"
    $control.Text = $text
    $control.SetBounds($x,$y,$w,$h)
    $form.Controls.Add($control)
    return $control
}
$symbol = Add-Control Label '' 18 14 64 64
$symbol.Font = [Drawing.Font]::new('Segoe UI Symbol',24)
$symbol.TextAlign = 'MiddleCenter'
$title = Add-Control Label 'Stopped' 94 17 385 30
$title.Font = [Drawing.Font]::new('Segoe UI',15,[Drawing.FontStyle]::Bold)
$detail = Add-Control Label '' 95 51 395 30
$pause = Add-Control Button 'Pause' 18 88 150 36
$scheduled = Add-Control CheckBox 'Daily four-hour break from' 18 136 213 34
$start = Add-Control DateTimePicker '' 234 137 83 30
$start.Format = 'Custom'
$start.CustomFormat = 'HH:mm'
$start.ShowUpDown = $true
$start.Value = [DateTime]::Today.AddHours(18)
$save = Add-Control Button 'Save break' 329 136 150 32
$null = Add-Control Label 'Seed address (wss://)' 18 184 260 22
$seed = Add-Control TextBox '' 18 207 461 28
if ([IO.File]::Exists($seedFile)) { $seed.Text = [IO.File]::ReadAllText($seedFile).Trim() }
$null = Add-Control Label 'Testnet wallet file' 18 241 210 23
$wallet = Add-Control TextBox (Join-Path $env:USERPROFILE 'jg-pilot.keystore.json') 18 264 370 27
$browse = Add-Control Button 'Browse' 394 262 85 30
$join = Add-Control Button 'Join testnet' 18 309 153 34
$null = Add-Control Label 'Local time. Close the node terminal to end.' 182 316 310 27
$script:joining = $null
function Read-Prefs {
    if (Test-Path -LiteralPath $prefs) { return (Get-Content -Raw -LiteralPath $prefs | ConvertFrom-Json) }
    return [pscustomobject]@{ manual=$false; quietStart=$null }
}
function Write-Prefs($p) {
    $tmp = $prefs + '.' + [guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($tmp, ($p | ConvertTo-Json -Compress))
    if ([IO.File]::Exists($prefs)) { [IO.File]::Replace($tmp,$prefs,"$prefs.previous") }
    else { [IO.File]::Move($tmp,$prefs) }
}
function Show-Error($message) { [void][Windows.Forms.MessageBox]::Show($form,$message,'JGTC participant') }
function Read-Status {
    $stream = [IO.File]::Open($view, 'Open', 'Read', ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader = [IO.StreamReader]::new($stream)
    try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
}
function Update-Panel {
    $state = 'Stopped'
    $info = 'Choose your seed and wallet to join.'
    $active = $false
    try {
        if ([IO.File]::Exists($view)) {
            $v = Read-Status
            $age = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $v.updatedAt
            if ($age -ge 0 -and $age -lt 8000 -and (Get-Process -Id $v.pid -ErrorAction SilentlyContinue)) {
                $state = [string]$v.state
                $active = @('Running','Starting','Paused','Pausing') -contains $state
                if ($state -eq 'Running') { $info = "Block $($v.tip.height)   |   Peers $($v.tip.peers)" }
                elseif ($v.reason) { $info = [string]$v.reason }
                else { $info = 'See the node terminal for details.' }
            } elseif ($v.state -eq 'Expired') { $state = 'Expired'; $info = 'Review a new card to continue.' }
        }
        if (!$active -and $script:joining -and !$script:joining.HasExited) { $state='Starting'; $info='Complete enrollment in the node terminal.'; $active=$true }
        $p = Read-Prefs
        if ($p.manual) { $pause.Text='Resume' } else { $pause.Text='Pause' }
        $pause.Enabled = $active -and ($p.manual -or $state -eq 'Running' -or $state -eq 'Starting')
    } catch { $state='Unavailable'; $info='Cannot read local status or pause settings.'; $pause.Enabled=$false }
    $title.Text=$state
    $detail.Text=$info
    $join.Enabled=!$active
    if ($state -eq 'Running') {
        $symbol.Text=[char]0x25B6; $symbol.ForeColor=[Drawing.Color]::SeaGreen
    } elseif ($state -eq 'Paused' -or $state -eq 'Pausing') {
        $symbol.Text=[string][char]0x275A + [char]0x275A; $symbol.ForeColor=[Drawing.Color]::DarkOrange
    } else { $symbol.Text=[char]0x25A0; $symbol.ForeColor=[Drawing.Color]::SlateGray }
}
try {
    $p = Read-Prefs
    if ($p.quietStart) {
        $start.Value=[DateTime]::ParseExact($p.quietStart,'HH:mm',[Globalization.CultureInfo]::InvariantCulture)
        $scheduled.Checked=$true
    }
} catch { Show-Error 'The break settings could not be read. Repair the settings file before joining.' }
$pause.Add_Click({
    try { $p=Read-Prefs; $p.manual=!$p.manual; Write-Prefs $p; Update-Panel } catch { Show-Error $_.Exception.Message }
})
$save.Add_Click({
    try {
        $p=Read-Prefs
        $p.quietStart=if ($scheduled.Checked) { $start.Value.ToString('HH:mm') } else { $null }
        Write-Prefs $p
        $detail.Text='Daily break settings saved.'
    } catch { Show-Error $_.Exception.Message }
})
$browse.Add_Click({
    $dialog=[Windows.Forms.OpenFileDialog]::new()
    $dialog.Filter='Wallet keystore (*.json)|*.json'
    try { if ($dialog.ShowDialog($form) -eq 'OK') { $wallet.Text=$dialog.FileName } } finally { $dialog.Dispose() }
})
$join.Add_Click({
    try {
        $url=$seed.Text.Trim()
        $uri=[uri]$url
        if ($url -match '[\s"]' -or !$uri.IsAbsoluteUri -or $uri.Scheme -ne 'wss' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Enter the WSS seed address from your coordinator.' }
        $exe=Join-Path $app 'node.exe'
        if (!(Test-Path -LiteralPath $exe)) { $exe=(Get-Command node.exe).Source }
        if (![IO.File]::Exists($wallet.Text) -and $wallet.Text -eq (Join-Path $env:USERPROFILE 'jg-pilot.keystore.json')) {
            $form.Enabled=$false
            try {
                $detail.Text='Finish the wallet guide in the terminal.'
                $form.Refresh()
                Start-Process -FilePath $exe -ArgumentList 'dist/scripts/wallet-cli.js guide' -WorkingDirectory $app -WindowStyle Normal -Wait
            } finally { $form.Enabled=$true }
            if (![IO.File]::Exists($wallet.Text)) { throw 'To use a wallet saved somewhere else, choose Browse and select it.' }
        }
        $file=(Get-Item -LiteralPath $wallet.Text -ErrorAction Stop).FullName
        if (![IO.File]::Exists($file)) { throw 'Choose an existing encrypted testnet wallet file.' }
        [IO.File]::WriteAllText($seedFile,$url)
        $argsText='dist/scripts/testnet-node.js --participate --system-card --port 0 --status-port 0 --keystore "'+$file+'" --seed "'+$url+'" --datadir "'+$dir+'"'
        $script:joining=Start-Process -FilePath $exe -ArgumentList $argsText -WorkingDirectory $app -WindowStyle Normal -PassThru
        Update-Panel
    } catch { Show-Error $_.Exception.Message }
})
$timer=[Windows.Forms.Timer]::new()
$timer.Interval=1000
$timer.Add_Tick({ Update-Panel })
Update-Panel
if ($MyInvocation.InvocationName -eq '.') { return }
$timer.Start()
try { [void]$form.ShowDialog() } finally { $timer.Dispose(); $form.Dispose() }
