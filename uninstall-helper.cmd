@echo off
setlocal
cd /d "%~dp0"
set "STARPORT_NODE=node"
if exist runtime\node.exe set "STARPORT_NODE=%~dp0runtime\node.exe"
"%STARPORT_NODE%" scripts\install-helper.mjs --uninstall
pause
