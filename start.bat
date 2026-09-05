@echo off
setlocal EnableExtensions EnableDelayedExpansion
title TracingLight Server
cd /d "%~dp0"

echo.
echo  ============================================
echo    TracingLight Server
echo    http://localhost:5000
echo    Press Ctrl+C to stop
echo  ============================================
echo.

REM ---------- 1. Check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed.
    echo          Download the LTS version from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM ---------- 2. Check dependencies ----------
if not exist "node_modules" (
    echo  [ERROR] Dependencies not installed.
    echo          Please run setup.bat first.
    echo.
    pause
    exit /b 1
)

REM ---------- 3. Check database ----------
if not exist "data\tracinglight.db" (
    echo  [WARN] Database not found. It will be created on first start.
    echo         (For demo data run init-db.bat or setup.bat first)
    echo.
)

REM ---------- 4. Clean stale dev locks ----------
if exist ".next\dev\lock" (
    echo  Cleaning stale lock file...
    del /q ".next\dev\lock" 2>nul
)

REM ---------- 5. Check port 5000 ----------
netstat -ano | findstr /R /C:":5000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo  [WARN] Port 5000 is already in use.
    echo.
    echo  Possible reasons:
    echo    1. The server is already running - just open http://localhost:5000
    echo    2. Another program occupies port 5000.
    echo.
    echo  To find it:  netstat -ano ^| findstr :5000
    echo  To stop it:  taskkill /PID ^<number^> /F
    echo.
    pause
    exit /b 1
)

echo  Starting server...
echo.
set PORT=5000
call npx tsx src/server.ts

echo.
echo  Server stopped.
pause
endlocal
