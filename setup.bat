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

REM ---------- 3. first-time schema push & seed (only if not seeded) ----------
if not exist "data" mkdir data
if exist "data\.pg_seeded" (
    echo [3/4] PostgreSQL already seeded, keeping existing data.
) else (
    echo [3/4] Pushing schema and generating demo data...
    call "%~dp0node_modules\.bin\drizzle-kit.cmd" push >nul 2>&1
    call "%~dp0node_modules\.bin\tsx.cmd" src/storage/database/seed.ts
    if errorlevel 1 (
        echo.
        echo  [ERROR] Seed data generation failed. Check PostgreSQL is reachable.
        echo.
        pause
        exit /b 1
    )
    echo. > "data\.pg_seeded"
)

REM ---------- 3b. generate .env (if missing) with random JWT secret ----------
if exist ".env" (
    echo [3/4] .env already exists, keeping existing.
) else (
    echo [3/4] Generating .env with random JWT secret...
    node -e "var f=require('fs'),c=require('crypto');var s=c.randomBytes(32).toString('hex');var env=['# TracingLight environment','','# ========== Zhipu AI ==========','# fill in your key from https://open.bigmodel.cn','ZHIPU_API_KEY=your_zhipu_api_key_here','ZHIPU_MODEL=glm-4-flash','','# ========== JWT Auth ==========','JWT_SECRET='+s,'','# ========== Database (PostgreSQL) ==========','DATABASE_DRIVER=postgres','# edit DATABASE_URL to point to your PostgreSQL instance','DATABASE_URL=postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight','','# ========== Server ==========','NODE_ENV=production','PORT=5000'].join('\n')+'\n';f.writeFileSync('.env',env.toString());"
    if errorlevel 1 (
        echo.
        echo  [ERROR] Failed to generate .env file.
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
