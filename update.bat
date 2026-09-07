@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title TracingLight - Update / Rebuild

echo ================================================
echo   TracingLight - Update / Rebuild
echo ================================================
echo.

REM ---------- 1. check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js not found. Install Node.js 18+ first.
    echo          Download: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM ---------- 2. ensure dependencies ----------
if not exist "node_modules\.bin\next.cmd" (
    echo [1/3] Dependencies missing, installing...
    call npx --yes pnpm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] Dependency install failed.
        echo.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencies OK.
)

REM ---------- 3. optional: pull latest from remote ----------
set PULL_ARG=%~1
if /i "%PULL_ARG%"=="pull" (
    if not exist ".git" (
        echo [2/3] No git repo found, skipping pull.
    ) else (
        echo [2/3] Pulling latest code (fast-forward only)...
        git pull --ff-only
        if errorlevel 1 (
            echo.
            echo  [IMPORTANT] Fast-forward pull failed. Local changes may conflict.
            echo   - Check with:  git status
            echo  Alternatively run this script WITHOUT the "pull" argument.
            echo.
            pause
            exit /b 1
        )
    )
) else (
    echo [2/3] Skipping git pull (run "update.bat pull" to fetch latest first).
)

REM ---------- 4. rebuild production bundle ----------
echo [3/3] Building production bundle, this refreshes the running app...
call "%~dp0node_modules\.bin\next.cmd" build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed. Fix errors and re-run this script.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Update complete! Starting server...
echo   Close this window to stop the server.
echo   Access:  http://localhost:5000
echo ================================================
echo.
call "%~dp0start.bat"