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
    pause
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)

echo Cleaning old locks...
if exist ".next\dev\lock" del /q ".next\dev\lock"
if exist ".next\dev" rmdir /s /q ".next\dev" 2>nul

echo Starting server...
set PORT=5000
call npx tsx src/server.ts

pause
