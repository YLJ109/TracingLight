@echo off
REM ============================================================
REM  TracingLight - PostgreSQL Backup  (pure ASCII, double-clickable)
REM  Usage:
REM    backup-pg.bat              use local pg_dump (port 5432)
REM    backup-pg.bat docker       dump from the running docker container (port 5433)
REM    backup-pg.bat install      register a daily 02:00 schedule task (needs admin)
REM    backup-pg.bat uninstall    remove the schedule task
REM  Output: backups\pg_YYYYMMDD_HHMMSS.dump  (keeps latest 7)
REM ============================================================
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0..\.."
title TracingLight DB Backup

set "PGHOST=127.0.0.1"
set "PGPORT=5432"
set "PGUSER=tracinglight"
set "PGDB=tracinglight"
set "PGPASSWORD=tracinglight_pw"

set "OUT=%CD%\backups"
if not exist "%OUT%" mkdir "%OUT%"

REM ---------- install / uninstall schedule task ----------
if /i "%~1"=="install" goto install
if /i "%~1"=="uninstall" goto uninstall

REM ---------- choose dump target ----------
set "TARGET=docker"
if /i not "%~1"=="docker" set "TARGET=local"

set "DUMPFILE=%OUT%\pg_%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%.dump"
set "DUMPFILE=%DUMPFILE: =0%"

echo  ============================================
if "%TARGET%"=="docker" (
  echo  Backing up via docker container...
  docker ps --format "{{.Names}}" | findstr /r "^tracinglight-postgres" >nul 2>nul
  if errorlevel 1 (
    echo  [ERROR] Container tracinglight-postgres is not running.
    echo          Start it first, e.g. docker\start-docker.bat
    pause
    goto :eof
  )
  docker exec tracinglight-postgres pg_dump -U !PGUSER! -d !PGDB! -F c -f /tmp/tl_backup.dump
  if errorlevel 1 goto fail
  docker cp tracinglight-postgres:/tmp/tl_backup.dump "!DUMPFILE!"
  if errorlevel 1 goto fail
) else (
  call :find_pg_dump
  if not defined pg_dump goto no_pgdump
  echo  Backing up local PostgreSQL (%PGPORT%)...
  "!pg_dump!" -h !PGHOST! -p !PGPORT! -U !PGUSER! -d !PGDB! -F c -f "!DUMPFILE!"
  if errorlevel 1 goto fail
)
echo  [OK] Backup saved: !DUMPFILE!

REM ---------- retention: keep latest 7 ----------
echo.
echo  Cleaning old backups (keep 7)...
for /f "skip=7 delims=" %%f in ('dir /b /o-d "%OUT%\pg_*.dump"') do (
  del /q "%OUT%\%%f" 2>nul
  echo  removed %%f
)
echo.
echo  ============================================
echo  Done. Backups folder: backups\
echo  Tip: you are covered only if this backup file is
echo       copied off this machine (cloud/other disk).
echo  ============================================
pause
goto :eof

:fail
echo  [ERROR] pg_dump failed. Check PostgreSQL is running and creds in .env.
pause
goto :eof

:no_pgdump
echo  [ERROR] pg_dump not found on PATH or in standard install dir.
echo          Install PostgreSQL binaries, then re-run.
pause
goto :eof

:install
echo  Registering daily backup at 02:00...
schtasks /create /tn "TracingLight-PGBackup" /tr "\"%~f0\"" /sc daily /st 02:00 /f
if errorlevel 1 (
  echo  [ERROR] Failed to register task. Run as Administrator.
) else (
  echo  [OK] Scheduled task TracingLight-PGBackup registered (daily 02:00).
  echo       Target of the task:
  schtasks /query /tn "TracingLight-PGBackup"
)
pause
goto :eof

:uninstall
schtasks /delete /tn "TracingLight-PGBackup" /f
pause
goto :eof

REM ---------- helper: locate pg_dump ----------
:find_pg_dump
set "pg_dump="
where pg_dump 1>nul 2>nul
if not errorlevel 1 (
  set "pg_dump=pg_dump"
  goto :eof
)
for /d %%p in ("C:\Program Files\PostgreSQL\*") do (
  if exist "%%p\bin\pg_dump.exe" (
    set "pg_dump=%%p\bin\pg_dump.exe"
    goto :eof
  )
)
goto :eof

endlocal