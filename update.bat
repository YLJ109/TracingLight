@echo off
setlocal
cd /d "%~dp0"
title TracingLight - Update

echo ================================================
echo   TracingLight - Update
echo   Pulls latest code, rebuilds, then you can start.
echo   Both to build and start: use  start.bat update
echo ================================================

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist "node_modules\.bin\next.cmd" goto depsok
echo [1/3] Dependencies missing, installing...
call npx --yes pnpm install
if errorlevel 1 goto buildfail

:depsok
echo [1/3] Dependencies already installed.

if not "%~1"=="pull" goto skip_pull
if not exist ".git" goto skip_pull
echo [2/3] Pulling latest code...
git pull --ff-only
if errorlevel 1 goto pullfail
goto do_build

:skip_pull
echo [2/3] Skipping git pull. Run "update.bat pull" to fetch latest first.

:do_build
echo [3/3] Building production bundle, this may take a few minutes...
call "%~dp0node_modules\.bin\next.cmd" build
if errorlevel 1 goto buildfail
goto done

:nonode
echo.
echo  [ERROR] Node.js not found. Install Node.js 18+ first.
echo   Download: https://nodejs.org/
pause
exit /b 1

:buildfail
echo.
echo  [ERROR] Build failed. Fix the errors above and re-run.
pause
exit /b 1

:pullfail
echo.
echo  [ERROR] Pull failed. Local changes may conflict.
echo   - Check with:  git status
echo   - Re-run without "pull" to build anyway.
pause
exit /b 1

:done
echo.
echo  ================================================
echo   Build complete! Start server with:  start.bat
echo   Development hot-reload:             start.bat dev
echo   Update mode, build + start:         start.bat update
echo   Access: http://localhost:5000
echo  ================================================
pause
exit /b 0
