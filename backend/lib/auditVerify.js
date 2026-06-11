/**
 * 审计日志 hash 链验证器
 *
 * 配套 middleware/audit.js：
 *   - 每次 audit() 写入都会在事务里取 prev_hash → 算 curr_hash
 *   - 任意一条被 UPDATE/DELETE，链就断
 *
 * 本模块提供：
 *   - verifyChain()       : 同步校验整条链（已有，在 audit.js）
 *   - verifyWithStats()   : 返回 { ok, total, brokenAt, error, ... } 详细信息
 *   - renderReport(result): 把结果格式化成可读文本 / JSON
 *
 * 用途：
 *   1. 定时任务：scripts/audit-verify.js
 *   2. admin API：/api/auditLogs/verify（admin 才能调）
 *   3. 健康检查：在 /api/health 里增量报 hash 链状态
 */
const { verifyChain, GENESIS_HASH } = require('../middleware/audit')
const { getDb } = require('../db')

/**
 * 完整校验 + 统计
 *   - ok:        true / false
 *   - total:     参与校验的记录数（含 curr_hash != ''）
 *   - skipped:   被跳过的旧记录（curr_hash == ''，迁移前写入的）
 *   - brokenAt:  第一条不匹配的 id
 *   - expected:  期望的 prev_hash / curr_hash
 *   - got:       实际读到的
 *   - error:     异常描述
 */
function verifyWithStats() {
  const result = {
    ok: false,
    total: 0,
    skipped: 0,
    brokenAt: null,
    expected: null,
    got: null,
    error: null,
    firstId: null,
    lastId: null,
    range: null
  }
  try {
    // 统计总数 / 跳过数 / 首末 id
    const db = getDb()
    const allRow = db.prepare('SELECT COUNT(*) AS c, MIN(id) AS minId, MAX(id) AS maxId FROM audit_logs').get()
    const skippedRow = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE curr_hash = ''`).get()
    const firstRow = db.prepare(`SELECT id, curr_hash FROM audit_logs WHERE curr_hash != '' ORDER BY id ASC LIMIT 1`).get()
    const lastRow = db.prepare(`SELECT id, curr_hash FROM audit_logs WHERE curr_hash != '' ORDER BY id DESC LIMIT 1`).get()
    result.total = allRow.c
    result.skipped = skippedRow.c
    result.firstId = firstRow ? firstRow.id : null
    result.lastId = lastRow ? lastRow.id : null
    result.range = (firstRow && lastRow) ? [firstRow.id, lastRow.id] : null

    // 调用 verifyChain 真正校验
    const r = verifyChain()
    result.ok = r.ok
    if (!r.ok) {
      result.brokenAt = r.brokenAt
      result.expected = r.expected
      result.got = r.got
    } else {
      // 成功时也用 total - skipped 作为"已校验条数"
      result.total = r.total
    }
  } catch (e) {
    result.error = e.message
  }
  return result
}

/**
 * 把 verifyWithStats() 输出格式化成可读文本
 *   - human=true: 给人看
 *   - human=false: 给日志/监控
 */
function renderReport(stats, opts = {}) {
  const human = opts.human !== false
  if (human) {
    const lines = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '  审计日志 hash 链校验报告',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `  数据库总记录数:        ${stats.total + stats.skipped}`,
      `  参与校验（有 hash）:   ${stats.total}`,
      `  跳过（迁移前旧记录）:  ${stats.skipped}`,
      stats.range ? `  校验区间:              id ${stats.range[0]} → ${stats.range[1]}` : '  校验区间:              (无)',
      `  校验结果:              ${stats.ok ? '✅ 链完整' : '❌ 链断裂'}`,
    ]
    if (!stats.ok) {
      lines.push(`  断裂位置:              id ${stats.brokenAt}`)
      if (stats.expected) lines.push(`  期望 prev_hash:        ${stats.expected.slice(0, 16)}...`)
      if (stats.got)      lines.push(`  实际 prev_hash:        ${stats.got.slice(0, 16)}...`)
    }
    if (stats.error) lines.push(`  错误:                  ${stats.error}`)
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    return lines.join('\n')
  }
  // JSON 模式
  return JSON.stringify(stats, null, 2)
}

module.exports = {
  verifyWithStats,
  renderReport,
  // 重导出，保持向后兼容
  verifyChain,
  GENESIS_HASH
}
