#!/bin/bash
# 诊室排班管理后台 - 日常部署/更新脚本
# 拉取最新代码并重启服务
#
# 用法：
#   ./deploy.sh                  # 标准部署
#   ./deploy.sh --no-cache      # 强制重新构建（不缓存）
#   ./deploy.sh --logs          # 部署后查看日志

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

# 解析参数
NO_CACHE=""
SHOW_LOGS=""
for arg in "$@"; do
  case $arg in
    --no-cache) NO_CACHE="--no-cache" ;;
    --logs) SHOW_LOGS="1" ;;
    --help|-h)
      echo "用法: $0 [选项]"
      echo "选项:"
      echo "  --no-cache    强制重新构建 Docker 镜像"
      echo "  --logs        部署后查看日志"
      exit 0
      ;;
  esac
done

echo "=========================================="
echo "  诊室排班管理后台 - 部署"
echo "=========================================="
echo "目录: $APP_DIR"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1) 拉取最新代码（如果在 git 仓库中）
if [ -d .git ]; then
  echo "[1/5] 拉取最新代码..."
  git pull --rebase || {
    echo "⚠️  git pull 失败，使用本地代码继续"
  }
else
  echo "[1/5] 非 git 仓库，跳过"
fi

# 2) 备份数据库（重要！）
echo "[2/5] 备份数据库..."
if [ -f data/schedule.db ]; then
  BACKUP_NAME="schedule_$(date +%Y%m%d_%H%M%S).db"
  cp data/schedule.db "data/${BACKUP_NAME}"
  echo "      备份到 data/${BACKUP_NAME}"
  # 清理 7 天前的备份
  find data -name "schedule_*.db" -mtime +7 -delete 2>/dev/null || true
fi

# 3) 拉取最新镜像（如有）
echo "[3/5] 拉取最新镜像..."
docker compose pull 2>/dev/null || true

# 4) 重新构建并启动
echo "[4/5] 重新构建并启动..."
if [ -n "$NO_CACHE" ]; then
  docker compose build $NO_CACHE
else
  docker compose build
fi
docker compose up -d

# 5) 健康检查
echo "[5/5] 健康检查..."
sleep 5

# 等待服务完全启动
for i in {1..10}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "      ✓ API 健康（200）"
    break
  fi
  echo "      ... 等待 ($i/10): HTTP $STATUS"
  sleep 2
done

echo
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
docker compose ps
echo
echo "常用命令："
echo "  查看日志:     cd $APP_DIR && docker compose logs -f"
echo "  仅看后端日志: cd $APP_DIR && docker compose logs -f backend"
echo "  重启服务:     cd $APP_DIR && docker compose restart"
echo "  停止服务:     cd $APP_DIR && docker compose down"
echo "=========================================="

# 显示日志（如果指定）
if [ -n "$SHOW_LOGS" ]; then
  echo
  echo "=========================================="
  echo "  实时日志（Ctrl+C 退出）"
  echo "=========================================="
  docker compose logs -f
fi
