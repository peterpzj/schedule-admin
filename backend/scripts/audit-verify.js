#!/usr/bin/env node
/**
 * 审计日志 hash 链校验 CLI
 *
 * 用途：
 *   - 定时任务（cron）每天跑一次
 *   - CI 健康检查
 *   - 运维手工排查
 *
 * 用法：
 *   node scripts/audit-verify.js                # 默认 JSON 输出，退出码 0/1
 *   node scripts/audit-verify.js --human        # 人类可读
 *   node scripts/audit-verify.js --quiet        # 链完整时静默（cron 友好）
 *
 * 退出码：
 *   0 = 链完整
 *   1 = 链断裂
 *   2 = 运行异常（DB 不可达等）
 *
 * 配合 deploy.sh 里的 cron 写法：
 *   0 3 * * * cd /opt/schedule-admin/backend && node scripts/audit-verify.js --quiet || \
 *     echo "[ALERT] audit log hash chain broken on $(date)" | mail -s "audit broken" ops@your-domain.com
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { initDb } = require('../db')
const { verifyWithStats, renderReport } = require('../lib/auditVerify')

const args = process.argv.slice(2)
const human = args.includes('--human')
const quiet = args.includes('--quiet')

async function main() {
  try {
    await initDb()
    const stats = verifyWithStats()
    if (!quiet || !stats.ok) {
      console.log(renderReport(stats, { human }))
    }
    if (!stats.ok) {
      process.exit(1)
    }
    process.exit(0)
  } catch (e) {
    console.error('audit-verify failed:', e && e.message || e)
    process.exit(2)
  }
}

main()
