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
const { verifyChain, GENESIS_HASH, computeHash } = require('../middleware/audit')
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
 * 增量校验：只校验 id > lastId 的行，避免全表 O(N) 扫描
 *   - lastId 默认 0 → 等价于 verifyChain()（全量）
 *   - lastId > 0 时：先用 lastId 那一行的 curr_hash 作为起点 prevHash，
 *     再只查 id > lastId 的行做链式校验
 *   - 返回 { ok, total, brokenAt, expected, got, sinceId, lastCheckedId }
 *
 * 用法：
 *   - 健康检查：每次拿上次跑过的 lastId 做增量，几万行只需校验几十/几百行新行
 *   - 上一次 full verify 出 brokenAt 时，可以从 brokenAt - 1 做增量定位增量损坏位置
 *
 * 注意事项：
 *   - lastId 必须指向一条 curr_hash != '' 的行，否则起点 prev_hash 拿不到
 *   - 调用方负责保证 lastId 之前那段历史已经被校验过（否则增量 OK 不代表全链 OK）
 */
function verifyChainSince(lastId = 0) {
  const db = getDb()
  let prevHash = GENESIS_HASH
  let sinceId = 0

  if (lastId > 0) {
    // 取 lastId 那一行的 curr_hash 作为本次校验的 prev_hash 起点
    const prev = db.prepare(
      'SELECT curr_hash FROM audit_logs WHERE id = ? AND curr_hash != \'\''
    ).get(lastId)
    if (!prev) {
      return {
        ok: false,
        total: 0,
        brokenAt: null,
        expected: null,
        got: null,
        sinceId: lastId,
        lastCheckedId: null,
        error: `lastId=${lastId} not found or has empty curr_hash`
      }
    }
    prevHash = prev.curr_hash
    sinceId = lastId
  }

  const rows = db.prepare(
    'SELECT * FROM audit_logs WHERE curr_hash != \'\' AND id > ? ORDER BY id ASC'
  ).all(sinceId)

  let lastCheckedId = null
  for (const r of rows) {
    if (r.prev_hash !== prevHash) {
      return {
        ok: false,
        brokenAt: r.id,
        expected: prevHash,
        got: r.prev_hash,
        sinceId,
        lastCheckedId: lastCheckedId
      }
    }
    const expect = computeHash(prevHash, {
      userId: r.user_id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      details: r.details,
      ip: r.ip,
      createdAt: r.created_at
    })
    if (expect !== r.curr_hash) {
      return {
        ok: false,
        brokenAt: r.id,
        expected: expect,
        got: r.curr_hash,
        sinceId,
        lastCheckedId: lastCheckedId
      }
    }
    prevHash = r.curr_hash
    lastCheckedId = r.id
  }

  return {
    ok: true,
    total: rows.length,
    sinceId,
    lastCheckedId: lastCheckedId
  }
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
  verifyChainSince,
  // 重导出，保持向后兼容
  verifyChain,
  GENESIS_HASH
}
