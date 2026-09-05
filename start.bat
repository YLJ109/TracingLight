@echo off
setlocal
cd /d "%~dp0"
title 溯光TracingLight - 启动

set MODE=%~1
set PORT_DEFAULT=5000

REM ---------- 检查依赖已安装 ----------
if not exist "%~dp0node_modules\.bin\tsx.cmd" (
    echo.
    echo  [提示] 依赖未安装，请先运行  setup.bat  完成部署后再启动。
    echo.
    pause
    exit /b 1
)

REM ---------- 模式判定：默认生产，传 dev 走开发热更新 ----------
if /i "%MODE%"=="dev" goto dev

REM ---------- 生产模式 ----------
if not exist ".next\BUILD_ID" (
    echo.
    echo  [提示] 未找到生产构建，请先运行  setup.bat  完成部署。
    echo         或运行  start.bat dev  以开发模式启动。
    echo.
    pause
    exit /b 1
)
if not defined PORT set "PORT=%PORT_DEFAULT%"
set "NODE_ENV=production"
echo.
echo  启动服务(生产模式):  http://localhost:%PORT%
echo  按 Ctrl+C 停止。关闭本窗口即停止服务。
echo.
call "%~dp0node_modules\.bin\tsx.cmd" src/server.ts
goto end

:dev
if not defined PORT set "PORT=%PORT_DEFAULT%"
set "NODE_ENV=development"
echo.
echo  启动服务(开发模式):  http://localhost:%PORT%
echo  支持热更新。按 Ctrl+C 停止。关闭本窗口即停止服务。
echo.
call "%~dp0node_modules\.bin\tsx.cmd" watch src/server.ts
goto end

:end
endlocal