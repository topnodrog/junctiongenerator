# Build an offline Windows x64 wallet from the reviewed CLI and production lockfile.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$buildDir = Join-Path $packageRoot ('.tmp/wallet-windows/' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $buildDir 'JGTC Wallet'
$runtime = Join-Path $stage 'runtime'
$null = New-Item -ItemType Directory -Path $runtime -Force
$version = '24.22.3'
$archiveName = "node-v$version-win-x64"
$expectedSha256 = 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f'
$download = Join-Path $buildDir 'node.zip'
Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$version/$archiveName.zip" -OutFile $download
if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $expectedSha256) {
    throw 'Node.js archive checksum mismatch.'
}
& tar.exe -xf $download -C $runtime --strip-components 1 "$archiveName/node.exe" "$archiveName/LICENSE"
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the verified Node.js runtime.' }

$config = @{
    extends = (Join-Path $packageRoot 'tsconfig.json')
    files = @((Join-Path $packageRoot 'src/scripts/wallet-cli.ts'))
    include = @()
    compilerOptions = @{ outDir = (Join-Path $runtime 'dist'); declaration = $false; declarationMap = $false; sourceMap = $false }
}
$configPath = Join-Path $buildDir 'tsconfig.wallet.json'
$config | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $configPath -Encoding UTF8
& (Join-Path $packageRoot 'node_modules/.bin/tsc.cmd') -p $configPath
if ($LASTEXITCODE -ne 0) { throw 'Wallet compilation failed.' }
Copy-Item -LiteralPath (Join-Path $packageRoot 'Open JGTC Wallet.cmd') -Destination $stage
foreach ($file in @('package.json', 'package-lock.json')) {
    Copy-Item -LiteralPath (Join-Path $packageRoot $file) -Destination $runtime
}
Push-Location -LiteralPath $runtime
try {
    & npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Could not install locked runtime dependencies.' }
    & (Join-Path $runtime 'node.exe') dist/scripts/wallet-cli.js help | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Packaged wallet smoke check failed.' }
} finally { Pop-Location }
$outputZip = Join-Path $buildDir 'JGTC-Wallet-Windows-x64.zip'
& tar.exe -acf $outputZip -C $buildDir 'JGTC Wallet'
if ($LASTEXITCODE -ne 0) { throw 'Could not archive the wallet.' }
Get-FileHash -LiteralPath $outputZip -Algorithm SHA256 | Format-List Path, Hash
