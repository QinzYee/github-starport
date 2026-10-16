@echo off
setlocal
cd /d "%~dp0"
set "STARPORT_NODE=node"
if exist runtime\node.exe set "STARPORT_NODE=%~dp0runtime\node.exe"
"%STARPORT_NODE%" --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.19 or newer is required. Please install Node.js first.
  pause
  exit /b 1
)
"%STARPORT_NODE%" -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=19)?0:1)"
if errorlevel 1 (
  echo Please update Node.js to 22.19 or newer.
  pause
  exit /b 1
)
if not exist node_modules\express (
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo Dependency installation failed. Check your network and try again.
    pause
    exit /b 1
  )
)
if not defined PORT set PORT=4317
set STARPORT_OPEN=1
"%STARPORT_NODE%" server\index.js
pause
