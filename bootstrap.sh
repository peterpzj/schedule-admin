#!/bin/bash
# 诊室排班管理后台 - 首次部署脚本
# 在已 git clone 的项目目录里运行；或被云端引导脚本调用
#
# 用法：
#   本地：git clone https://github.com/peterpzj/schedule-admin.git /opt/schedule-admin
#         cd /opt/schedule-admin && bash bootstrap.sh
#   云端：bash <(curl -sSL https://raw.githubusercontent.com/peterpzj/schedule-admin/main/云端部署/bootstrap.sh)

set -e

# ============ 配置 ============
APP_DIR="${APP_DIR:-$(pwd)}"
DOMAIN="${DOMAIN:-admin.your-domain.com}"
API_DOMAIN="${API_DOMAIN:-api.your-domain.com}"
EMAIL="${EMAIL:-admin@your-domain.com}"
# ==============================

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  诊室排班管理后台 - 首次部署"
echo "=========================================="
echo "部署目录: $APP_DIR"
echo "API 域名:  $API_DOMAIN"
echo "后台域名:  $DOMAIN"
echo "=========================================="

# 1) 检查 root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}请使用 root 运行: sudo bash bootstrap.sh${NC}"
  exit 1
fi

# 2) 询问域名（如果是交互式）
if [ -t 0 ] && [ "$DOMAIN" = "admin.your-domain.com" ]; then
  echo -e "${YELLOW}首次部署需要配置域名信息${NC}"
  read -p "API 域名 (如 api.example.com): " INPUT_API
  read -p "后台域名 (如 admin.example.com): " INPUT_ADMIN
  read -p "邮箱 (用于 SSL 证书): " INPUT_EMAIL
  DOMAIN=${INPUT_ADMIN:-admin.your-domain.com}
  API_DOMAIN=${INPUT_API:-api.your-domain.com}
  EMAIL=${INPUT_EMAIL:-admin@your-domain.com}
fi

cd "$APP_DIR"

# 3) 更新系统
echo "[1/7] 更新系统包..."
apt update -qq && apt upgrade -y -qq

# 4) 安装基础工具
echo "[2/7] 安装 curl / git / nginx..."
apt install -y -qq curl wget git nginx ufw software-properties-common apt-transport-https ca-certificates openssl

# 5) 安装 Docker（如未安装）
if ! command -v docker &> /dev/null; then
  echo "[3/7] 安装 Docker..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm /tmp/get-docker.sh
else
  echo "[3/7] Docker 已安装"
fi

if ! docker compose version &> /dev/null 2>&1; then
  echo "      安装 docker compose plugin..."
  apt install -y -qq docker-compose-plugin
fi

# 6) 生成 .env
echo "[4/7] 生成 .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  JWT_SECRET=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-64)
  ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d "=+/" | cut -c1-16)
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
  sed -i "s|ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$ADMIN_PASSWORD|" .env

  echo
  echo "=========================================="
  echo "  🔑 首次登录账号"
  echo "=========================================="
  echo "  账号: admin"
  echo "  密码: $ADMIN_PASSWORD"
  echo "=========================================="
  echo "  ⚠️  部署后立即在 Web 后台修改！"
  echo "=========================================="
  echo "$ADMIN_PASSWORD" > /tmp/admin_password.txt
  chmod 600 /tmp/admin_password.txt
else
  echo "      .env 已存在"
fi

# 7) 准备目录
echo "[5/7] 创建数据目录..."
mkdir -p data uploads logs
# 持久化数据权限
chown -R $SUDO_USER:$SUDO_USER data uploads logs 2>/dev/null || true

# 8) 启动 Docker 服务
echo "[6/7] 构建并启动容器..."
docker compose pull 2>/dev/null || true
docker compose build
docker compose up -d

# 9) 等待并验证
echo "[7/7] 等待服务启动..."
sleep 20

# 健康检查
HEALTH_OK=0
for i in {1..15}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "      ✓ 后端健康 (HTTP 200)"
    HEALTH_OK=1
    break
  fi
  echo "      ... 等待 $i/15: HTTP $STATUS"
  sleep 2
done

if [ "$HEALTH_OK" != "1" ]; then
  echo -e "${RED}后端未启动成功，查看日志：${NC}"
  docker compose logs --tail=50 backend
  exit 1
fi

# 10) 配置 Nginx
if [ ! -f /etc/nginx/sites-available/schedule ]; then
  echo
  echo "=========================================="
  echo "  配置 Nginx 反向代理"
  echo "=========================================="

  cat > /etc/nginx/sites-available/schedule <<EOF
# API 反向代理
server {
    listen 80;
    server_name $API_DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 20M;
    }
}

# Web 后台
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

  ln -sf /etc/nginx/sites-available/schedule /etc/nginx/sites-enabled/schedule
  nginx -t && systemctl reload nginx
  echo "      ✓ Nginx 配置完成"
fi

# 11) 配置防火墙
ufw allow OpenSSH 2>/dev/null
ufw allow 'Nginx Full' 2>/dev/null
ufw --force enable 2>/dev/null

# 12) 配置 HTTPS（Let's Encrypt）
if [ "$DOMAIN" != "admin.your-domain.com" ] && [ "$DOMAIN" != "your-domain.com" ]; then
  echo
  echo "申请 SSL 证书..."
  if ! command -v certbot &> /dev/null; then
    apt install -y -qq certbot python3-certbot-nginx
  fi
  if certbot --nginx \
    -d "$API_DOMAIN" \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos --no-eff-email 2>&1; then
    echo "      ✓ SSL 证书配置完成"
  else
    echo -e "${YELLOW}⚠️  SSL 申请失败（可能域名未解析或 80 端口被占用）${NC}"
    echo "      部署仍然完成，可在域名解析就绪后手动运行："
    echo "      certbot --nginx -d $API_DOMAIN -d $DOMAIN"
  fi
fi

# 13) 最终报告
echo
echo "=========================================="
echo -e "  ${GREEN}✅ 初始化完成！${NC}"
echo "=========================================="
docker compose ps
echo
echo "=========================================="
echo "  访问信息"
echo "=========================================="
echo "  Web 后台:  http://$DOMAIN"
echo "  API:       http://$API_DOMAIN/api"
echo "  账号:      admin"
echo "  密码:      $(cat /tmp/admin_password.txt 2>/dev/null || echo '查看 .env')"
echo
echo "=========================================="
echo "  下一步"
echo "=========================================="
echo "  1. 在小程序中编辑 miniprogram/config/app.js"
echo "     API_BASE_URL: 'https://$API_DOMAIN'"
echo "  2. 微信公众平台 → 服务器域名 → 添加 https://$API_DOMAIN"
echo "  3. （可选）配置自动部署："
echo "     https://github.com/peterpzj/schedule-admin/settings/secrets/actions"
echo "  4. 部署目录: $APP_DIR"
echo "  5. 查看日志: cd $APP_DIR && docker compose logs -f"
echo "=========================================="
