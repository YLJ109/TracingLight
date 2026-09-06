@echo off
setlocal
cd /d "%~dp0"
title TracingLight - Start

set MODE=%~1
set PORT_DEFAULT=5000

REM ---------- check dependencies installed ----------
if not exist "%~dp0node_modules\.bin\tsx.cmd" (
    echo.
    echo  [WARN] Dependencies not installed. Run setup.bat first.
    echo.
    pause
    exit /b 1
)

REM ---------- mode: default=production, pass "dev" for hot-reload ----------
if /i "%MODE%"=="dev" goto dev

REM ---------- production mode ----------
if not exist ".next\BUILD_ID" (
    echo.
    echo  [WARN] No production build found. Run setup.bat first,
    echo          or use "start.bat dev" for development mode.
    echo.
    pause
    exit /b 1
)
if not defined PORT set "PORT=%PORT_DEFAULT%"
set "NODE_ENV=production"
echo.
echo  Starting server (production):  http://localhost:%PORT%
echo  Press Ctrl+C to stop. Closing this window stops the server.
echo.
call "%~dp0node_modules\.bin\tsx.cmd" src/server.ts
goto end

:dev
if not defined PORT set "PORT=%PORT_DEFAULT%"
set "NODE_ENV=development"
echo.
echo  Starting server (development):  http://localhost:%PORT%
echo  Hot-reload enabled. Press Ctrl+C to stop. Closing this window stops it.
echo.
call "%~dp0node_modules\.bin\tsx.cmd" watch src/server.ts
goto end

:end
endlocal