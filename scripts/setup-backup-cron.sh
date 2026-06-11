#!/bin/bash
# 安装备份 cron 任务
# 用法：sudo bash scripts/setup-backup-cron.sh
#  - 写入 /etc/cron.d/schedule-backup
#  - 每天凌晨 2 点跑一次（可调）
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$APP_DIR/backend"
BACKUP_SCRIPT="$BACKEND_DIR/scripts/backup.js"
VERIFY_SCRIPT="$BACKEND_DIR/scripts/verify-backup.js"

if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "ERROR: $BACKUP_SCRIPT not found" >&2
  exit 1
fi

if [ -f "$APP_DIR/.env" ]; then
  set -a
  . "$APP_DIR/.env"
  set +a
fi

NODE_BIN="$(command -v node || echo /usr/bin/node)"
[ -x "$NODE_BIN" ] || { echo "ERROR: node not found"; exit 1; }

LOG_FILE="/var/log/schedule-backup.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="$APP_DIR/logs/schedule-backup.log"
mkdir -p "$(dirname "$LOG_FILE")"

CRON_FILE="/etc/cron.d/schedule-backup"
TMP_FILE="$(mktemp)"

# 默认每天 02:00 执行；并附带 verify
CRON_SCHEDULE=${BACKUP_CRON_SCHEDULE:-"0 2 * * *"}

cat > "$TMP_FILE" <<EOF
# schedule-admin 数据库备份（默认每天凌晨 2 点）
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
DB_PATH=${DB_PATH:-$APP_DIR/backend/data/schedule.db}
BACKUP_DIR=${BACKUP_DIR:-$APP_DIR/backend/data/backups}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
BACKUP_KEEP_DAILY=${BACKUP_KEEP_DAILY:-7}
BACKUP_KEEP_WEEKS=${BACKUP_KEEP_WEEKS:-4}
BACKUP_KEEP_MONTHS=${BACKUP_KEEP_MONTHS:-12}
BACKUP_KEEP_TIERED=${BACKUP_KEEP_TIERED:-true}

$CRON_SCHEDULE root cd $BACKEND_DIR && $NODE_BIN scripts/backup.js --verify >> $LOG_FILE 2>&1
EOF

install -m 644 "$TMP_FILE" "$CRON_FILE"
rm -f "$TMP_FILE"
echo "OK: cron file installed to $CRON_FILE"
echo "OK: log file: $LOG_FILE"
echo "OK: schedule: $CRON_SCHEDULE"
echo
echo "Test now:"
echo "  cd $BACKEND_DIR && $NODE_BIN scripts/backup.js --dry-run"
echo "  cd $BACKEND_DIR && $NODE_BIN scripts/verify-backup.js --latest"
echo
echo "List existing backups:"
ls -lht "$APP_DIR/backend/data/backups/" 2>/dev/null | head -10 || echo "  (none yet)"
