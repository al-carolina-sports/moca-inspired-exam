@echo off
rem Starts a tiny local web server for the MoCA-inspired exam and opens it in your default browser.
rem Speech recognition only works from http://localhost (not from a double-clicked index.html).
title MoCA-inspired exam server
cd /d "%~dp0"
where powershell >nul 2>nul
if %errorlevel%==0 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
  goto :end
)
rem Optional fallback if PowerShell is missing but Python is installed
where python >nul 2>nul
if %errorlevel%==0 (
  echo PowerShell not found; using Python instead.
  start "" http://localhost:8765/index.html
  python -m http.server 8765 --bind 127.0.0.1
  goto :end
)
echo Neither PowerShell nor Python was found. Please use Windows PowerShell 5.1 or newer.
pause
:end
