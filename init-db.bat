@echo off
cd /d "%~dp0"

echo ============================================
echo   TracingLight - Database Init (Fresh)
echo ============================================
echo.

REM Clean everything
echo [1/2] Cleaning old data...
if exist "data\tracinglight.db" (
    del /q "data\tracinglight.db"
    echo   Old database deleted
)
if exist "data\_test.db" del /q "data\_test.db"
if not exist "data" mkdir data
echo   Clean done
echo.

REM Run seed
echo [2/2] Seeding database...
call npx tsx src/storage/database/seed.ts
if %errorlevel% neq 0 (
    echo [ERROR] Seed failed
    pause & exit /b 1
)

echo.
echo ============================================
echo   Done! Now run start.bat
echo ============================================
pause
