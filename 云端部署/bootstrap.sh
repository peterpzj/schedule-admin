#!/bin/bash
# 诊室排班管理后台 - 自包含的云端引导脚本
#
# 用途：在新服务器上一行启动：
#   bash <(curl -sSL https://raw.githubusercontent.com/peterpzj/schedule-admin/main/云端部署/bootstrap.sh)
#
# 它会：
#   1. 安装 Docker / Nginx
#   2. 克隆主仓库到 /opt/schedule-admin
#   3. 切换到主仓库继续运行内部 bootstrap.sh

set -e

# ============ 配置 ============
REPO_URL="${REPO_URL:-git@github.com:peterpzj/schedule-admin.git}"
APP_DIR="${APP_DIR:-/opt/schedule-admin}"
BRANCH="${BRANCH:-main}"
# ==============================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  诊室排班管理后台 - 云端引导"
echo "=========================================="
echo "仓库: $REPO_URL"
echo "安装目录: $APP_DIR"
echo "=========================================="

# 1) 检查 root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}请使用 root: sudo bash bootstrap.sh${NC}"
  exit 1
fi

# 2) 询问域名
if [ -t 0 ]; then
  read -p "API 域名 (如 api.example.com): " INPUT_API
  read -p "后台域名 (如 admin.example.com): " INPUT_ADMIN
  read -p "邮箱 (用于 SSL): " INPUT_EMAIL
  export DOMAIN=${INPUT_ADMIN:-admin.your-domain.com}
  export API_DOMAIN=${INPUT_API:-api.your-domain.com}
  export EMAIL=${INPUT_EMAIL:-admin@your-domain.com}
fi

# 3) 安装基础工具 + Docker
echo "[1/4] 安装基础工具..."
apt update -qq
apt install -y -qq curl wget git nginx ufw software-properties-common apt-transport-https ca-certificates openssl

if ! command -v docker &> /dev/null; then
  echo "[2/4] 安装 Docker..."
  curl -fsSL https://get.docker.com | sh
else
  echo "[2/4] Docker 已安装"
fi

if ! docker compose version &> /dev/null 2>&1; then
  echo "      安装 docker compose plugin..."
  apt install -y -qq docker-compose-plugin
fi

# 4) 克隆仓库
if [ ! -d "$APP_DIR" ]; then
  echo "[3/4] 克隆仓库到 $APP_DIR..."
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  echo "[3/4] $APP_DIR 已存在，拉取最新..."
  cd "$APP_DIR"
  git pull origin "$BRANCH" || true
fi

# 5) 切换到主目录运行主 bootstrap
cd "$APP_DIR"
if [ -f "./bootstrap.sh" ]; then
  echo "[4/4] 运行主 bootstrap.sh..."
  chmod +x ./bootstrap.sh
  bash ./bootstrap.sh
else
  echo -e "${RED}[错误] 主 bootstrap.sh 不存在，请检查仓库${NC}"
  exit 1
fi
