@echo off
setlocal
title TracingLight Backfill Dimension Scores
cd /d "%~dp0"

echo.
echo  ============================================
echo   Backfill dimension_scores for gradings
echo  ============================================
echo.

REM ---------- 0. Check dependencies ----------
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

REM ---------- 1. Run backfill ----------
echo  Backfilling completed gradings that have NULL dimension_scores...
call node scripts\maintenance\backfill-dimension-scores.cjs
if errorlevel 1 (
    echo.
    echo  [ERROR] Backfill failed. Check PostgreSQL is reachable.
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   Done. Refresh the teacher student detail page
echo ============================================
echo.
pause
endlocal