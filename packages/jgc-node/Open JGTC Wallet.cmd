@echo off
setlocal EnableExtensions DisableDelayedExpansion
title JGTC Testnet Wallet
pushd "%~dp0" || exit /b 1
if exist "runtime\node.exe" goto portable
where.exe node.exe >nul 2>&1 || goto needsnode
where.exe npm.cmd >nul 2>&1 || goto needsnode
if exist "node_modules\.bin\tsc.cmd" goto build
echo Preparing the wallet for first use...
call npm.cmd ci --include=dev --no-fund --no-audit
if errorlevel 1 goto failed
:build
call npm.cmd run build
if errorlevel 1 goto failed
node.exe dist\scripts\wallet-cli.js guide
goto finished
:portable
"runtime\node.exe" "runtime\dist\scripts\wallet-cli.js" guide
goto finished
:needsnode
echo This is the source edition. Extract the portable Windows wallet ZIP to use it without installing Node.js.
goto failed
:finished
if errorlevel 1 goto failed
echo.
echo Press any key to close this window.
pause >nul
popd
exit /b 0
:failed
echo.
echo The wallet stopped. Read the message above, then press any key to close.
pause >nul
popd
exit /b 1
