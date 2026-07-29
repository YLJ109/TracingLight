@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

echo.
echo    ========================================
echo      TracingLight V3.0 - One Click Setup
echo    ========================================
echo.

REM =============================================
REM  1. Check runtime environment
REM =============================================
echo [1/6] Checking runtime...

where node >nul 2>nul || (
    echo [ERROR] Node.js not found!
    echo Please install Node.js >= 20 from https://nodejs.org/
    pause & exit /b 1
)
echo   Node.js v%node:~0,-1%
for /f "tokens=*" %%i in ('node -v') do echo   %%i

where pnpm >nul 2>nul || (
    echo   Installing pnpm...
    call npm install -g pnpm || (
        echo [ERROR] Failed to install pnpm
        pause & exit /b 1
    )
)
echo   pnpm ready

REM =============================================
REM  2. Configure environment variables
REM =============================================
echo.
echo [2/6] Configuring environment...

set "NEED_KEY=0"

REM Check if .env already has a valid API key
if exist ".env" (
    findstr /R /C:"ZHIPU_API_KEY=." .env >nul 2>nul
    if !errorlevel! equ 0 (
        findstr /C:"your_zhipu_api_key_here" .env >nul 2>nul
        if !errorlevel! equ 0 set "NEED_KEY=1"
    ) else (
        set "NEED_KEY=1"
    )
) else (
    set "NEED_KEY=1"
)

if "!NEED_KEY!"=="1" (
    echo.
    echo   ========================================
    echo     Zhipu API Key Required
    echo     Get your free key at: https://open.bigmodel.cn
    echo   ========================================
    echo.
    set /p ZHIPU_KEY="   Paste your ZHIPU_API_KEY: "
    if "!ZHIPU_KEY!"=="" (
        echo   [WARNING] No API key entered. AI features will not work.
    )

    REM Generate JWT secret
    for /f "tokens=1-4 delims=/:." %%a in ("%time%") do set "TS=%%a%%b%%c%%d"
    set "JWT_SECRET=tracinglight_%RANDOM%%RANDOM%%TS%"

    REM Write .env
    (
    echo # TracingLight Environment
    echo ZHIPU_API_KEY=!ZHIPU_KEY!
    echo ZHIPU_MODEL=glm-4-flash
    echo JWT_SECRET=!JWT_SECRET!
    echo DATABASE_PATH=./data/tracinglight.db
    echo NODE_ENV=production
    echo PORT=5000
    ) > .env
    echo   .env configured
) else (
    echo   .env already configured - skipping
)

REM =============================================
REM  3. Install dependencies
REM =============================================
echo.
echo [3/6] Installing dependencies...
call pnpm install || (
    echo [ERROR] Failed to install dependencies
    pause & exit /b 1
)
echo   Dependencies installed

REM =============================================
REM  4. Initialize database
REM =============================================
echo.
echo [4/6] Initializing database...

if not exist "data" mkdir data

REM Drop old database if exists
if exist "data\tracinglight.db" (
    echo   Removing old database...
    del /q "data\tracinglight.db"
)

echo   Importing seed data (tables auto-created)...
call npx tsx src/storage/database/seed.ts || (
    echo [ERROR] Seed data import failed
    pause & exit /b 1
)
echo   Database ready

REM =============================================
REM  5. Build project
REM =============================================
echo.
echo [5/6] Building project...
call pnpm next build || (
    echo [ERROR] Next.js build failed
    pause & exit /b 1
)
call npx tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
echo   Build complete

REM =============================================
REM  6. Start server
REM =============================================
echo.
echo [6/6] Starting server...
echo.
echo    ========================================
echo      Setup complete! Server starting...
echo      Frontend:  http://localhost:5000
echo      Press Ctrl+C to stop
echo    ========================================
echo.
echo    Test accounts:
echo      Teacher: teacher_wang / teacher_li
echo      Student: stu_zhang ~ stu_ma
echo    ========================================
echo.

set NODE_ENV=production
set PORT=5000
node dist/server.js

pause
