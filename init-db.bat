@echo off
setlocal EnableExtensions EnableDelayedExpansion
title TracingLight Database Reset
cd /d "%~dp0"

echo.
echo  ============================================
echo    TracingLight - Database Reset (Fresh)
echo  ============================================
echo.
echo   WARNING: All data will be replaced with
echo   fresh demo data (accounts stay the same).
echo.
set /p CONFIRM="  Type Y to continue: "
if /i not "!CONFIRM!"=="Y" (
    echo  Cancelled.
    pause
    exit /b 0
)

REM ---------- 0. Make sure server is not running ----------
netstat -ano | findstr /R /C:":5000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo  [ERROR] The server is running on port 5000.
    echo          Stop it first (close the server window, or
    echo          run: taskkill /PID ^<number^> /F after netstat -ano ^| findstr :5000^)
    echo          Otherwise the old data would be written back.
    pause
    exit /b 1
)

REM ---------- 1. Check dependencies ----------
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed.
    pause
    exit /b 1
)
if not exist "node_modules" (
    echo  [ERROR] Dependencies not installed. Run setup.bat first.
    pause
    exit /b 1
)

REM ---------- 2. Reset PostgreSQL data ----------
echo  [1/2] Truncating all PostgreSQL tables...
del /q "data\.pg_seeded" 2>nul
if not exist "data" mkdir data
echo.

REM ---------- 3. Seed ----------
echo  [2/2] Pushing schema + seeding database, please wait...
call npx drizzle-kit push >nul 2>&1
call npx tsx src/storage/database/seed.ts
if errorlevel 1 (
    echo.
    echo  [ERROR] Seed failed. Check PostgreSQL is reachable.
    pause
    exit /b 1
)
echo. > "data\.pg_seeded"

echo.
echo  ============================================
echo    Database reset complete!
echo    Next: run start.bat  ^(http://localhost:5000^)
echo    Demo accounts: admin/123456, teacher_0_0, stu_0_2
echo  ============================================
echo.
pause
endlocal
