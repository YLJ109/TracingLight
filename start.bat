@echo off
setlocal
cd /d "%~dp0"
title TracingLight - Start

set NODE_ENV=production
if not defined PORT set PORT=5000

REM ---------- sanity: local PostgreSQL expected on 5433 ----------
echo  (Direct mode: expects your local PostgreSQL on localhost:5433.)
echo  (Docker users: use start-docker.bat instead.)

if /i not "%~1"=="dev" goto prod
goto dev

:dev
set NODE_ENV=development
if exist "%~dp0node_modules\.bin\tsx.cmd" goto dev_run
echo  Dependencies not installed. Run setup.bat first.
pause
exit /b 1

:dev_run
echo  Starting dev server (hot reload) at http://localhost:5000 ...
call "%~dp0node_modules\.bin\tsx.cmd" watch src/server.ts
echo.
echo  Dev server stopped.
pause
exit /b 0


:prod
if exist "%~dp0node_modules\.bin\tsx.cmd" goto prod_deps_ok
echo  Dependencies not installed. Run setup.bat first.
pause
exit /b 1

:prod_deps_ok
if exist ".next\BUILD_ID" goto produce
echo  No build found, building production bundle (first run only)...
call "%~dp0node_modules\.bin\next.cmd" build
if errorlevel 1 goto build_fail

:produce
echo  Starting production server at http://localhost:5000 ...
call "%~dp0node_modules\.bin\tsx.cmd" src/server.ts
echo.
echo  Server stopped.
pause
exit /b 0

:build_fail
echo  Build failed.
pause
exit /b 1