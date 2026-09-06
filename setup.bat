@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title TracingLight - One-click Setup

echo ====================================================
echo   TracingLight - One-click Setup / Init
echo ====================================================

REM ---------- 1. check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js not found. Install Node.js 18+ and re-run.
    echo          Download: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [1/4] Node.js ready: !NODE_VER!

REM ---------- 2. install dependencies (skip if present) ----------
if exist "node_modules\.bin" (
    echo [2/4] Dependencies already present, skipping install.
) else (
    echo [2/4] Installing dependencies, first run may take a few minutes...
    call npx --yes pnpm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] Dependency install failed. Check network and retry.
        echo.
        pause
        exit /b 1
    )
)

REM ---------- 3. data dir & first-time seed (only if empty db) ----------
if not exist "data" mkdir data
if exist "data\tracinglight.db" (
    echo [3/4] Database already exists, keeping existing data.
) else (
    echo [3/4] First run, generating demo data...
    call "%~dp0node_modules\.bin\tsx.cmd" src/storage/database/seed.ts
    if errorlevel 1 (
        echo.
        echo  [ERROR] Seed data generation failed.
        echo.
        pause
        exit /b 1
    )
)

REM ---------- 4. production build ----------
echo [4/4] Building production bundle, please wait...
call "%~dp0node_modules\.bin\next.cmd" build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed.
    echo.
    pause
    exit /b 1
)

echo.
echo ====================================================
echo   Setup complete! Run  start.bat  to start the server
echo   Access:  http://localhost:5000
echo ====================================================
pause