@echo off
setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title TracingLight - Start (Docker PostgreSQL)

set NODE_ENV=production
if not defined PORT set PORT=5000

REM ---------- ensure PostgreSQL container is running ----------
where docker >nul 2>nul
if not errorlevel 1 (
    call docker exec tracinglight-postgres pg_isready -U tracinglight -d tracinglight >nul 2>nul
    if not exist "data\.pg_seeded" (
        echo  Database not seeded yet. Run docker\setup-docker.bat first.
        pause
        exit /b 1
    )
    if errorlevel 1 (
        echo  Starting PostgreSQL container...
        call docker compose -f "%~dp0docker-compose.yml" up -d
        if errorlevel 1 (
            echo  [ERROR] Failed to start PostgreSQL container.
            pause
            exit /b 1
        )
    )
) else (
    echo  [WARN] Docker not found. Make sure PostgreSQL is running on localhost:5433.
)

if /i not "%~1"=="dev" goto prod
goto dev

:dev
set NODE_ENV=development
if exist "node_modules\.bin\tsx.cmd" goto dev_run
echo  Dependencies not installed. Run setup-docker.bat first.
pause
exit /b 1

:dev_run
echo  Starting dev server (hot reload) at http://localhost:5000 ...
call "node_modules\.bin\tsx.cmd" watch src/server.ts
echo.
echo  Dev server stopped.
pause
exit /b 0


:prod
if exist "node_modules\.bin\tsx.cmd" goto prod_deps_ok
echo  Dependencies not installed. Run setup-docker.bat first.
pause
exit /b 1

:prod_deps_ok
if exist ".next\BUILD_ID" goto produce
echo  No build found, building production bundle (first run only)...
call "node_modules\.bin\next.cmd" build
if errorlevel 1 goto build_fail

:produce
echo  Starting production server at http://localhost:5000 ...
call "node_modules\.bin\tsx.cmd" src/server.ts
echo.
echo  Server stopped.
pause
exit /b 0

:build_fail
echo  Build failed.
pause
exit /b 1
