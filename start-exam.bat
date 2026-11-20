@echo off
rem Starts a tiny local web server for the Cognitive Exam and opens the Windows version in your default browser.
rem Speech recognition only works from http://localhost (not from a double-clicked index.html).
title Cognitive Exam server
setlocal
cd /d "%~dp0"
cls
echo ==========================================================
echo   COGNITIVE EXAM - starting a small server on this computer
echo ==========================================================
echo.
echo Folder: %~dp0
echo.

where powershell >nul 2>nul
if errorlevel 1 goto :nopowershell

echo [1/2] Unblocking the downloaded files (removes the "from the internet" mark)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-ChildItem -LiteralPath '%~dp0.' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue } catch { }" >nul 2>nul

echo [2/2] Starting the server. Your browser opens in a moment.
echo       Leave this black window OPEN while you use the exam.
echo       To stop: close this window, or press Ctrl+C.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
set "RC=%errorlevel%"
if not "%RC%"=="0" (
  echo.
  echo ----------------------------------------------------------
  echo  The server stopped with an error ^(code %RC%^).
  echo  - If another exam window is already open, use that one.
  echo  - Otherwise close this window and double-click start-exam.bat again.
  echo  - Still stuck? Open  http://localhost:8765/windows/  in Chrome or Edge.
  echo ----------------------------------------------------------
)
goto :end

:nopowershell
rem Optional fallback if PowerShell is missing but Python is installed
where python >nul 2>nul
if errorlevel 1 goto :nothing
echo PowerShell was not found; using Python instead.
start "" http://127.0.0.1:8765/windows/index.html
python -m http.server 8765 --bind 127.0.0.1
goto :end

:nothing
echo Neither PowerShell nor Python was found.
echo Please use Windows PowerShell 5.1 or newer, or open the hosted web address in Chrome or Edge.

:end
echo.
echo (Press any key to close this window.)
pause >nul
