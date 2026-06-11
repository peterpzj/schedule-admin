/**
 * 记录操作日志
 *   - 写入 audit_logs 表
 *   - 同时输出一条结构化日志（info 级别便于 ELK/Loki 检索）
 *   - #P0-4 修复：每条记录加 prev_hash + curr_hash 链式结构，防 audit_logs 被篡改
 *     curr_hash = sha256(prev_hash || user_id || action || entity || entity_id || details || ip || created_at)
 *   - 配套验证工具 lib/auditVerify.js 定期跑链式校验
 *   - 错误不再被 console.error 吞掉，改用 logger.error（带堆栈）
 */
const crypto = require('crypto');
const { getDb } = require('../db');
const log = require('../lib/logger');

// "创世 hash"：第一条 prev_hash 用此值，标识链起点
const GENESIS_HASH = 'GENESIS';

function computeHash(prevHash, fields) {
  // 字段顺序固定：prevHash | userId | action | entity | entityId | details | ip | createdAt
  const h = crypto.createHash('sha256')
  h.update(String(prevHash || GENESIS_HASH))
  h.update('|')
  h.update(String(fields.userId || ''))
  h.update('|')
  h.update(String(fields.action || ''))
  h.update('|')
  h.update(String(fields.entity || ''))
  h.update('|')
  h.update(String(fields.entityId || ''))
  h.update('|')
  h.update(String(fields.details || ''))
  h.update('|')
  h.update(String(fields.ip || ''))
  h.update('|')
  h.update(String(fields.createdAt || ''))
  return h.digest('hex')
}

function audit(userId, username, action, entity, entityId, details, ip) {
  try {
    const db = getDb();
    const detailsJson = JSON.stringify(details || {})

    // #P0-4：在事务里取 prev_hash + 插入，保证链原子性
    const tx = db.transaction(() => {
      // 1) 取最后一条的 curr_hash 作为本条的 prev_hash
      const last = db.prepare('SELECT curr_hash FROM audit_logs WHERE curr_hash != \'\' ORDER BY id DESC LIMIT 1').get()
      const prevHash = (last && last.curr_hash) || GENESIS_HASH

      // 2) 插入记录，curr_hash 先用 '' 留位
      const info = db.prepare(
        'INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, ip, prev_hash, curr_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'\')'
      ).run(
        userId, username, action, entity,
        String(entityId || ''),
        detailsJson,
        ip || '',
        prevHash
      )

      // 3) 计算本条的 curr_hash 并更新（用 SQLite 内置时间戳）
      const row = db.prepare('SELECT created_at FROM audit_logs WHERE id = ?').get(info.lastInsertRowid)
      const currHash = computeHash(prevHash, {
        userId, action, entity,
        entityId: String(entityId || ''),
        details: detailsJson,
        ip,
        createdAt: row && row.created_at
      })
      db.prepare('UPDATE audit_logs SET curr_hash = ? WHERE id = ?').run(currHash, info.lastInsertRowid)

      return { id: info.lastInsertRowid, prevHash, currHash }
    })

    const result = tx()
    log.info('audit', {
      id: result.id,
      userId, username, action, entity,
      entityId: String(entityId || ''),
      ip,
      prevHash: result.prevHash.slice(0, 12) + '...',
      currHash: result.currHash.slice(0, 12) + '...'
    });
  } catch (e) {
    log.error('audit.write.failed', {
      userId, action, entity,
      entityId: String(entityId || '')
    }, e);
  }
}

/**
 * 链式校验：返回 { ok, total, brokenAt, expected, got }
 *   ok=true  整条链完整
 *   ok=false brokenAt 是第一条不匹配的行 id，expected/got 是不一致的 prev_hash / curr_hash
 *
 * 配套 cron：建议每天跑一次（admin/scripts/audit-verify.js）
 */
function verifyChain() {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM audit_logs WHERE curr_hash != \'\' ORDER BY id ASC').all()
  let prevHash = GENESIS_HASH
  for (const r of rows) {
    if (r.prev_hash !== prevHash) {
      return { ok: false, brokenAt: r.id, expected: prevHash, got: r.prev_hash }
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
      return { ok: false, brokenAt: r.id, expected: expect, got: r.curr_hash }
    }
    prevHash = r.curr_hash
  }
  return { ok: true, total: rows.length }
}

module.exports = { audit, verifyChain, computeHash, GENESIS_HASH };
