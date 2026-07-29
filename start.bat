@echo off
title TracingLight
cd /d "%~dp0"

echo ============================================
echo   TracingLight V3.0
echo   http://localhost:5000
echo   Press Ctrl+C to stop
echo ============================================
echo.

if not exist ".env" (
    echo [ERROR] .env not found. Run setup.bat first.
    pause & exit /b 1
)

set PORT=5000
npx tsx src/server.ts

pause
