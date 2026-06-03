@echo off
REM ===========================================
REM   一键推送到 GitHub（Windows 版）
REM ===========================================
REM 用法：双击运行
REM   1. 第一次会让你输入 GitHub 仓库 URL
REM   2. 之后会要求你输入 commit message
REM   3. 自动 add / commit / push

chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ==========================================
echo   诊室排班管理后台 - Git 推送助手
echo ==========================================
echo.

REM 检查 git
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [错误] 未安装 Git，请先安装：https://git-scm.com/
  pause
  exit /b 1
)

REM 第一次推送：检查是否已设置 remote
git remote -v | findstr "origin" >nul
if %ERRORLEVEL% NEQ 0 (
  echo [提示] 首次推送需要配置 GitHub 仓库
  echo.
  set /p REPO_URL=请输入 GitHub 仓库 URL (例如 https://github.com/USER/schedule-admin.git):
  if "%REPO_URL%"=="" (
    echo [错误] 仓库 URL 不能为空
    pause
    exit /b 1
  )
  git remote add origin %REPO_URL%
  echo [OK] 已配置远程仓库
)

REM 显示状态
echo [当前状态]
git status --short
echo.

REM 输入 commit message
set /p MSG=请输入提交说明（直接回车使用默认）:
if "%MSG%"=="" set MSG=feat: 更新代码

echo.
echo [1/3] git add ...
git add .

echo.
echo [2/3] git commit ...
git commit -m "%MSG%"

echo.
echo [3/3] git push ...
git push -u origin main

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [提示] 推送失败，可能需要：
  echo   1. 在 GitHub 创建 Personal Access Token
  echo   2. 使用 SSH key（推荐）
  echo   3. 首次推送需 git push -u origin main --force
  echo.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo   ✅ 推送成功！
echo ==========================================
echo.
echo 接下来：
echo   1. SSH 到服务器
echo   2. cd /opt/schedule-admin
echo   3. ./deploy.sh
echo.
pause
