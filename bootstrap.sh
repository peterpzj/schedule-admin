#!/bin/bash
# 诊室排班管理后台 - 首次初始化脚本
# 在新服务器上首次运行，自动化安装所有依赖
#
# 用法：
#   bash <(curl -sSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/bootstrap.sh)
# 或：
#   git clone https://github.com/YOUR_USER/YOUR_REPO.git /opt/schedule-admin
#   cd /opt/schedule-admin && bash bootstrap.sh

set -e

# ============ 配置 ============
REPO_URL="${REPO_URL:-https://github.com/YOUR_USER/schedule-admin.git}"
APP_DIR="${APP_DIR:-/opt/schedule-admin}"
DOMAIN="${DOMAIN:-admin.your-domain.com}"
API_DOMAIN="${API_DOMAIN:-api.your-domain.com}"
EMAIL="${EMAIL:-admin@your-domain.com}"
# ==============================

echo "=========================================="
echo "  诊室排班管理后台 - 首次初始化"
echo "=========================================="
echo "安装目录: $APP_DIR"
echo "仓库: $REPO_URL"
echo "API 域名: $API_DOMAIN"
echo "管理后台域名: $DOMAIN"
echo "=========================================="
echo

# 1) 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 运行: sudo bash bootstrap.sh"
  exit 1
fi

# 2) 更新系统
echo "[1/8] 更新系统包..."
apt update -qq && apt upgrade -y -qq

# 3) 安装基础工具
echo "[2/8] 安装 curl / git / nginx..."
apt install -y -qq curl wget git nginx ufw software-properties-common apt-transport-https

# 4) 安装 Docker
if ! command -v docker &> /dev/null; then
  echo "[3/8] 安装 Docker..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm /tmp/get-docker.sh
else
  echo "[3/8] Docker 已安装"
fi

# 检查 docker compose
if ! docker compose version &> /dev/null; then
  echo "      安装 docker compose plugin..."
  apt install -y -qq docker-compose-plugin
fi

# 5) 克隆仓库
if [ ! -d "$APP_DIR" ]; then
  echo "[4/8] 克隆仓库到 $APP_DIR..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
else
  echo "[4/8] $APP_DIR 已存在"
  cd "$APP_DIR"
fi

# 6) 生成 .env
if [ ! -f "$APP_DIR/.env" ]; then
  echo "[5/8] 生成 .env..."
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  JWT_SECRET=$(openssl rand -base64 48)
  ADMIN_PASSWORD=$(openssl rand -base64 12)
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$APP_DIR/.env"
  sed -i "s|ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$ADMIN_PASSWORD|" "$APP_DIR/.env"
  echo "      已生成随机 JWT_SECRET 和 ADMIN_PASSWORD"
  echo "      ⚠️  首次登录账号: admin / $ADMIN_PASSWORD"
  echo "      ⚠️  请在 Web 后台「系统设置」立即修改默认密码！"
  echo
  # 保存密码到文件供查看
  echo "$ADMIN_PASSWORD" > /tmp/admin_password.txt
  echo "      密码已保存到 /tmp/admin_password.txt"
  echo "      查看命令: cat /tmp/admin_password.txt"
else
  echo "[5/8] .env 已存在"
fi

# 7) 准备数据目录
echo "[6/8] 创建数据目录..."
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/uploads"
mkdir -p "$APP_DIR/logs"

# 8) 启动 Docker 服务
echo "[7/8] 启动 Docker 容器..."
cd "$APP_DIR"
docker compose pull 2>/dev/null || true
docker compose build
docker compose up -d

# 9) 配置防火墙
echo "[8/8] 配置防火墙..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 10) 配置 SSL（HTTPS）
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo
  echo "配置 SSL（HTTPS）..."
  apt install -y -qq certbot python3-certbot-nginx
  certbot --nginx \
    -d "$API_DOMAIN" \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos --no-eff-email
fi

# 11) 等待并验证
echo
echo "等待服务启动（30 秒）..."
sleep 30

echo
echo "=========================================="
echo "  ✅ 初始化完成！"
echo "=========================================="
echo
echo "服务状态："
docker compose -f "$APP_DIR/docker-compose.yml" ps
echo
echo "健康检查："
curl -s -o /dev/null -w "API 健康状态: %{http_code}\n" https://$API_DOMAIN/api/health || true
echo
echo "=========================================="
echo "  访问地址"
echo "=========================================="
echo "  Web 后台:  https://$DOMAIN"
echo "  API:       https://$API_DOMAIN/api"
echo "  登录账号:  admin"
echo "  登录密码:  $(cat /tmp/admin_password.txt 2>/dev/null || echo '见 /tmp/admin_password.txt')"
echo
echo "  部署目录: $APP_DIR"
echo "  查看日志: cd $APP_DIR && docker compose logs -f"
echo "=========================================="
