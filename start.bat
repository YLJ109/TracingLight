@echo off
setlocal
cd /d "%~dp0"
title TracingLight - Start
set NODE_ENV=production
if not defined PORT set PORT=5000
if exist "%~dp0node_modules\.bin\tsx.cmd" goto check
echo  Dependencies not installed. Run setup.bat first.
pause
exit /b 1
:check
if exist ".next\BUILD_ID" goto run
echo  Building production bundle...
call "%~dp0node_modules\.bin\next.cmd" build
if errorlevel 1 goto fail
:run
call "%~dp0node_modules\.bin\tsx.cmd" src/server.ts
echo.
echo  Server stopped. Press any key to exit.
pause
exit /b 0
:fail
echo  Build failed.
pause
exit /b 1