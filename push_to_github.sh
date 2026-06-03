#!/bin/bash
# 一键推送到 GitHub（macOS / Linux 版）

set -e
cd "$(dirname "$0")"

echo "=========================================="
echo "  诊室排班管理后台 - Git 推送助手"
echo "=========================================="
echo

# 检查 git
if ! command -v git &> /dev/null; then
  echo "[错误] 未安装 Git"
  exit 1
fi

# 第一次推送：检查是否已设置 remote
if ! git remote -v | grep -q "origin"; then
  echo "[提示] 首次推送需要配置 GitHub 仓库"
  echo
  read -p "请输入 GitHub 仓库 URL (例如 https://github.com/USER/schedule-admin.git): " REPO_URL
  if [ -z "$REPO_URL" ]; then
    echo "[错误] 仓库 URL 不能为空"
    exit 1
  fi
  git remote add origin "$REPO_URL"
  echo "[OK] 已配置远程仓库"
fi

echo "[当前状态]"
git status --short
echo

# 输入 commit message
read -p "请输入提交说明（直接回车使用默认）: " MSG
if [ -z "$MSG" ]; then
  MSG="feat: 更新代码"
fi

echo
echo "[1/3] git add ..."
git add .

echo
echo "[2/3] git commit -m \"$MSG\""
git commit -m "$MSG" || echo "无变化，跳过 commit"

echo
echo "[3/3] git push ..."
git push -u origin main

echo
echo "=========================================="
echo "  ✅ 推送成功！"
echo "=========================================="
echo
echo "接下来："
echo "  1. SSH 到服务器"
echo "  2. cd /opt/schedule-admin"
echo "  3. ./deploy.sh"
