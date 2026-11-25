@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" || exit /b 1
if exist "runtime\node.exe" goto portable
if exist "node_modules\.bin\tsc.cmd" goto build
call npm.cmd ci --include=dev --no-audit --no-fund
if errorlevel 1 goto failed
:build
call npm.cmd run build
if errorlevel 1 goto failed
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "scripts\windows\Show-JgtcSoak.ps1" -AppRoot "."
goto finished
:portable
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "runtime\Show-JgtcSoak.ps1" -AppRoot "runtime"
:finished
if errorlevel 1 goto failed
popd
exit /b 0
:failed
echo Check the message above, then press any key to close.
pause >nul
popd
exit /b 1
