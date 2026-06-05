#!/bin/bash
# 诊室排班管理后台 - 日常部署/更新脚本
# 拉取最新代码并重启服务（含健康检查 + 自动回滚）
#
# 用法：
#   ./deploy.sh                  # 标准部署
#   ./deploy.sh --no-cache      # 强制重新构建（不缓存）
#   ./deploy.sh --logs          # 部署后查看日志
#   ./deploy.sh --rollback      # 回滚到上一个版本

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 解析参数
NO_CACHE=""
SHOW_LOGS=""
ROLLBACK=""
for arg in "$@"; do
  case $arg in
    --no-cache) NO_CACHE="--no-cache" ;;
    --logs) SHOW_LOGS="1" ;;
    --rollback) ROLLBACK="1" ;;
    --help|-h)
      cat <<EOF
用法: $0 [选项]

选项:
  --no-cache    强制重新构建 Docker 镜像
  --logs        部署后查看日志
  --rollback    回滚到上一个 git commit

示例:
  $0                    # 拉代码 + 重启
  $0 --no-cache         # 强制完全重新构建
  $0 --logs             # 部署后实时查看日志
  $0 --rollback         # 出问题快速回滚
EOF
      exit 0
      ;;
  esac
done

# ========== 回滚模式 ==========
if [ -n "$ROLLBACK" ]; then
  echo -e "${YELLOW}=========================================="
  echo -e "  ⚠️  回滚到上一个版本"
  echo -e "==========================================${NC}"
  if [ -d .git ]; then
    git checkout HEAD~1
    docker compose build
    docker compose up -d
    echo -e "${GREEN}✓ 已回滚到上一个 commit${NC}"
  else
    echo -e "${RED}非 git 仓库，无法回滚${NC}"
    exit 1
  fi
  exit 0
fi

echo "=========================================="
echo "  诊室排班管理后台 - 部署"
echo "=========================================="
echo "目录: $APP_DIR"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1) 拉取最新代码
if [ -d .git ]; then
  echo "[1/6] 拉取最新代码..."
  PREVIOUS_COMMIT=$(git rev-parse HEAD)
  if ! git pull --rebase 2>&1; then
    echo -e "${YELLOW}⚠️  git pull 失败，使用本地代码继续${NC}"
  fi
else
  echo "[1/6] 非 git 仓库，跳过"
  PREVIOUS_COMMIT=""
fi

# 2) 备份数据库
echo "[2/7] 备份数据库..."
if [ -f data/schedule.db ]; then
  BACKUP_NAME="schedule_$(date +%Y%m%d_%H%M%S).db"
  cp data/schedule.db "data/${BACKUP_NAME}"
  echo "      ✓ 备份到 data/${BACKUP_NAME}"
  # 清理 14 天前的备份
  find data -name "schedule_*.db" -mtime +14 -delete 2>/dev/null || true
fi

# 3) 构建前端（Docker 方式，无需 npm）
echo "[3/7] 构建前端..."
docker run --rm -v "$APP_DIR/frontend:/app" -w /app node:18-alpine \
  sh -c 'npm install && npm run build' 2>&1 | tail -3
echo "      ✓ 前端构建完成"

# 4) 重新构建镜像
echo "[4/7] 重新构建镜像..."
if [ -n "$NO_CACHE" ]; then
  docker compose build $NO_CACHE
else
  docker compose build
fi

# 5) 重启服务
echo "[5/7] 重启服务..."
docker compose up -d

# 6) 健康检查（轮询 30 秒）
echo "[6/7] 健康检查..."
HEALTH_OK=0
for i in {1..15}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "      ✓ API 健康（轮询 $i 次）"
    HEALTH_OK=1
    break
  fi
  echo "      ... 等待轮询 $i/15: HTTP $STATUS"
  sleep 2
done

# 7) 失败自动回滚
if [ "$HEALTH_OK" != "1" ]; then
  echo -e "${RED}=========================================="
  echo -e "  ❌ 健康检查失败，启动自动回滚"
  echo -e "==========================================${NC}"
  if [ -n "$PREVIOUS_COMMIT" ]; then
    git checkout "$PREVIOUS_COMMIT"
    docker compose build
    docker compose up -d
    echo -e "${YELLOW}已回滚到 commit $PREVIOUS_COMMIT${NC}"
  fi
  docker compose logs --tail=50
  exit 1
fi

echo
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
docker compose ps
echo
echo "最近备份："
ls -lht data/schedule_*.db 2>/dev/null | head -3 || echo "  （无）"
echo
echo "常用命令："
echo "  查看日志:     cd $APP_DIR && docker compose logs -f"
echo "  仅看后端日志: cd $APP_DIR && docker compose logs -f backend"
echo "  重启服务:     cd $APP_DIR && docker compose restart"
echo "  停止服务:     cd $APP_DIR && docker compose down"
echo "  回滚:         cd $APP_DIR && ./deploy.sh --rollback"
echo "=========================================="

# 显示日志
if [ -n "$SHOW_LOGS" ]; then
  echo
  echo "=========================================="
  echo "  实时日志（Ctrl+C 退出）"
  echo "=========================================="
  docker compose logs -f
fi
