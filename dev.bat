@echo off
setlocal
cd /d "%~dp0"
title TracingLight - Dev
set NODE_ENV=development
if not defined PORT set PORT=5000
if exist "%~dp0node_modules\.bin\tsx.cmd" goto run
echo  Dependencies not installed. Run setup.bat first.
pause
exit /b 1
:run
call "%~dp0node_modules\.bin\tsx.cmd" watch src/server.ts
echo.
echo  Server stopped. Press any key to exit.
pause