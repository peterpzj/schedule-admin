#!/bin/bash
# 安装告警检查 cron 任务
# 用法：sudo bash scripts/setup-alert-cron.sh
#  - 写入 /etc/cron.d/schedule-alert-check
#  - 每分钟由 cron 触发一次
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$APP_DIR/backend"
ALERT_SCRIPT="$BACKEND_DIR/scripts/alert-check.js"

if [ ! -f "$ALERT_SCRIPT" ]; then
  echo "ERROR: $ALERT_SCRIPT not found" >&2
  exit 1
fi

if [ -f "$APP_DIR/.env" ]; then
  set -a
  . "$APP_DIR/.env"
  set +a
fi

if [ -z "$ALERT_WEBHOOK_URL" ]; then
  echo "WARN: ALERT_WEBHOOK_URL not set, alerts will only be logged"
fi

NODE_BIN="$(command -v node || echo /usr/bin/node)"
[ -x "$NODE_BIN" ] || { echo "ERROR: node not found"; exit 1; }

LOG_FILE="/var/log/schedule-alert.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="$APP_DIR/logs/schedule-alert.log"
mkdir -p "$(dirname "$LOG_FILE")"

CRON_FILE="/etc/cron.d/schedule-alert-check"
TMP_FILE="$(mktemp)"
cat > "$TMP_FILE" <<EOF
# schedule-admin 告警检查（每分钟一次）
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ALERT_WEBHOOK_URL=${ALERT_WEBHOOK_URL}
METRICS_URL=${METRICS_URL:-http://localhost:3000/metrics}
ALERT_ERROR_RATE_THRESHOLD=${ALERT_ERROR_RATE_THRESHOLD:-0.05}
ALERT_P99_LATENCY_MS=${ALERT_P99_LATENCY_MS:-2000}
ALERT_DISK_USAGE_PCT=${ALERT_DISK_USAGE_PCT:-80}
ALERT_DEDUPE_MINUTES=${ALERT_DEDUPE_MINUTES:-10}
ALERT_STATE_FILE=${ALERT_STATE_FILE:-$APP_DIR/data/.alert-state.json}

* * * * * root cd $BACKEND_DIR && $NODE_BIN scripts/alert-check.js >> $LOG_FILE 2>&1
EOF

install -m 644 "$TMP_FILE" "$CRON_FILE"
rm -f "$TMP_FILE"
echo "OK: cron file installed to $CRON_FILE"
echo "OK: log file: $LOG_FILE"
echo
echo "Test now: cd $BACKEND_DIR && $NODE_BIN scripts/alert-check.js"
