@echo off
setlocal EnableExtensions EnableDelayedExpansion
title TracingLight Setup
cd /d "%~dp0"

echo.
echo  ============================================
echo    TracingLight - One Click Setup
echo  ============================================
echo.

REM ---------- 1. Check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed.
    echo          Please download and install the LTS version from:
    echo          https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo  [1/4] Node.js found: !NODE_VER!
echo.

REM ---------- 2. Install dependencies ----------
if not exist "node_modules" (
    echo  [2/4] Installing dependencies, please wait a few minutes...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo  [ERROR] npm install failed.
        echo          Check your network connection and run setup.bat again.
        echo.
        pause
        exit /b 1
    )
    echo  [2/4] Dependencies installed.
) else (
    echo  [2/4] Dependencies already installed - skipping.
)
echo.

REM ---------- 3. Prepare .env (no API key needed here) ----------
if not exist "data" mkdir data
if not exist ".env" (
    echo  [3/4] Creating .env ...
    set "SECRET="
    for /f "delims=" %%i in ('node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"') do set "SECRET=%%i"
    >  ".env" echo # TracingLight environment
    >> ".env" echo JWT_SECRET=!SECRET!
    >> ".env" echo DATABASE_PATH=./data/tracinglight.db
    >> ".env" echo NODE_ENV=development
    >> ".env" echo PORT=5000
    echo  [3/4] .env created.
    echo.
    echo  --------------------------------------------------
    echo   NOTE: AI features need an API key.
    echo   After the server starts, login as admin (pwd: 123456)
    echo   then go to: Admin - System Settings - AI Service Config
    echo   and fill in your API URL and Key there.
    echo  --------------------------------------------------
) else (
    echo  [3/4] .env already exists - skipping.
)
echo.

REM ---------- 4. Seed database (first run only) ----------
if not exist "data\tracinglight.db" (
    echo  [4/4] Seeding database, please wait...
    call npx tsx src/storage/database/seed.ts
    if errorlevel 1 (
        echo.
        echo  [ERROR] Database seed failed.
        echo.
        pause
        exit /b 1
    )
    echo  [4/4] Database ready.
) else (
    echo  [4/4] Database already exists - skipping. (Run init-db.bat to reset)
)
echo.
echo  ============================================
echo    Setup complete!
echo    Next: run start.bat to start the server.
echo    http://localhost:5000
echo    Accounts: teacher_wang / stu_zhang / admin
echo    AI config: Admin - System Settings
echo  ============================================
echo.
pause
endlocal
