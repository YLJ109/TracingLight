@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 溯光TracingLight - 一键部署(Setup)

echo ====================================================
echo   溯光 TracingLight  一键部署 / 初始化
echo ====================================================

REM ---------- 1. 检查 Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [错误] 未检测到 Node.js，请先安装 Node.js 18+ 后重新运行。
    echo         下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [1/4] Node.js 已就绪: !NODE_VER!

REM ---------- 2. 安装依赖（未安装时才装） ----------
if exist "node_modules\.bin" (
    echo [2/4] 依赖已存在，跳过安装。
) else (
    echo [2/4] 正在安装依赖，首次可能需要几分钟，请耐心等待...
    call npx --yes pnpm install
    if errorlevel 1 (
        echo.
        echo  [错误] 依赖安装失败，请检查网络后重试。
        echo.
        pause
        exit /b 1
    )
)

REM ---------- 3. 数据目录 & 首次播种（仅空库时） ----------
if not exist "data" mkdir data
if exist "data\tracinglight.db" (
    echo [3/4] 数据库已存在，保留现有数据。
) else (
    echo [3/4] 首次运行，正在生成演示数据...
    call "%~dp0node_modules\.bin\tsx.cmd" src/storage/database/seed.ts
    if errorlevel 1 (
        echo.
        echo  [错误] 演示数据生成失败。
        echo.
        pause
        exit /b 1
    )
)

REM ---------- 4. 生产构建 ----------
echo [4/4] 正在构建生产版本，请稍候...
call "%~dp0node_modules\.bin\next.cmd" build
if errorlevel 1 (
    echo.
    echo  [错误] 构建失败。
    echo.
    pause
    exit /b 1
)

echo.
echo ====================================================
echo   部署完成！请运行  start.bat  启动服务
echo   访问地址:  http://localhost:5000
echo ====================================================
pause