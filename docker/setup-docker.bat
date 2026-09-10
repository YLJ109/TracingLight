@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title TracingLight - Setup (Docker PostgreSQL)

echo ====================================================
echo   TracingLight - Setup (Docker PostgreSQL)
echo ====================================================

REM ---------- 0. check Docker ----------
where docker >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [ERROR] Docker not found. Install Docker Desktop and re-run,
    echo          or use  setup.bat  for a local PostgreSQL instance.
    echo.
    pause
    exit /b 1
)

REM ---------- 1. check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js not found. Install Node.js 18+ and re-run.
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [1/6] Node.js ready: !NODE_VER!

REM ---------- 2. start PostgreSQL container ----------
echo [2/6] Starting PostgreSQL container (port 5433)...
call docker compose -f "%~dp0docker-compose.yml" up -d
if errorlevel 1 (
    echo.
    echo  [ERROR] Failed to start PostgreSQL container.
    echo          Make sure Docker is running.
    echo.
    pause
    exit /b 1
)
call docker compose -f "%~dp0docker-compose.yml" ps postgres
echo Waiting for database to become ready...
call :wait_db
if errorlevel 1 (
    echo.
    echo  [ERROR] PostgreSQL did not become ready in time.
    echo.
    pause
    exit /b 1
)

REM ---------- 3. install dependencies (skip if present) ----------
if exist "node_modules\.bin" (
    echo [3/6] Dependencies already present, skipping install.
) else (
    echo [3/6] Installing dependencies, first run may take a few minutes...
    call npx --yes pnpm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] Dependency install failed. Check network and retry.
        echo.
        pause
        exit /b 1
    )
)

REM ---------- 3b. generate .env (if missing) ----------
if exist ".env" (
    echo [4/6] .env already exists, keeping existing.
) else (
    echo [4/6] Generating .env with random JWT secret...
    node -e "var f=require('fs'),c=require('crypto');var s=c.randomBytes(32).toString('hex');var env=['# TracingLight environment','','# ========== Zhipu AI ==========','# fill in your key from https://open.bigmodel.cn','ZHIPU_API_KEY=your_zhipu_api_key_here','ZHIPU_MODEL=glm-4-flash','','# ========== JWT Auth ==========','JWT_SECRET='+s,'','# ========== Database (PostgreSQL, Docker) ==========','DATABASE_DRIVER=postgres','DATABASE_URL=postgres://tracinglight:tracinglight_pw@localhost:5433/tracinglight','','# ========== Server ==========','NODE_ENV=production','PORT=5000'].join('\n')+'\n';f.writeFileSync('.env',env.toString());"
    if errorlevel 1 (
        echo.
        echo  [ERROR] Failed to generate .env file.
        echo.
        pause
        exit /b 1
    )
)

REM ---------- 4. first-time schema push & seed ----------
if not exist "data" mkdir data
if exist "data\.pg_seeded" (
    echo [5/6] Database already seeded, keeping existing data.
) else (
    echo [5/6] Pushing schema and generating demo data...
    call "node_modules\.bin\drizzle-kit.cmd" push >nul 2>&1
    call "node_modules\.bin\tsx.cmd" src/storage/database/seed.ts
    if errorlevel 1 (
        echo.
        echo  [ERROR] Seed data generation failed.
        echo.
        pause
        exit /b 1
    )
    echo. > "data\.pg_seeded"
)

REM ---------- 5. production build ----------
echo [6/6] Building production bundle, please wait...
call "node_modules\.bin\next.cmd" build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed.
    echo.
    pause
    exit /b 1
)

echo.
echo ====================================================
echo   Setup complete! Run  docker\start-docker.bat  to start
echo   Access:  http://localhost:5000
echo ====================================================
pause
exit /b 0

REM ---------- wait for healthy container ----------
:wait_db
for /l %%i in (1,1,30) do (
    call docker exec tracinglight-postgres pg_isready -U tracinglight -d tracinglight >nul 2>nul
    if not errorlevel 1 (
        echo     Database ready.
        exit /b 0
    )
    ping -n 2 127.0.0.1 >nul 2>nul
)
exit /b 1