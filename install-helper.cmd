@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap-helper.ps1"
if errorlevel 1 echo Installation failed. Check your network and extracted files.
pause
