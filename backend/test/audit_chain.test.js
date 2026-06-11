/**
 * 集成测试 5：审计日志 hash 链
 *   - 覆盖：连续 N 条 audit 写入后，链式校验 ok=true
 *   - 覆盖：手动改一条 curr_hash 后，链式校验 ok=false + brokenAt 命中
 *   - 覆盖：手动改 prev_hash（篡改"上一条"），下一条不匹配
 */
require('./setup')
const { describe, it, before, after } = require('node:test')
const { getApp, loginAsAdmin, asUser } = require('./test_helpers')
const { verifyChain, computeHash, GENESIS_HASH } = require('../middleware/audit')
const { getDb } = require('../db')

describe('审计日志 hash 链', () => {
  before(async () => {
    // 触发一些 audit 写入：登录 1 次 + 读 1 次 + 写 1 次
    const token = await loginAsAdmin()
    const user = asUser(token)
    await user.get('/api/auth/me')
    await user.get('/api/schedules?pageSize=1')
  })

  it('链式校验：当前 audit_logs 链完整', () => {
    const r = verifyChain()
    assert.equal(r.ok, true)
    assert.ok(r.total > 0)
  })

  it('篡改一条 curr_hash → 链断裂', () => {
    const db = getDb()
    // 找中间一条
    const mid = db.prepare('SELECT id, prev_hash, curr_hash FROM audit_logs WHERE curr_hash != \'\' ORDER BY id ASC LIMIT 1 OFFSET 1').get()
    assert.ok(mid)

    // 把它的 curr_hash 改坏
    const badHash = 'a'.repeat(64)
    db.prepare('UPDATE audit_logs SET curr_hash = ? WHERE id = ?').run(badHash, mid.id)

    // 链应该从这条或下一条断
    const r = verifyChain()
    assert.equal(r.ok, false)
    assert.ok(r.brokenAt !== undefined)
    // 清理：恢复原 hash（虽然 mavis testDB 重启会清，但保险起见）
    db.prepare('UPDATE audit_logs SET curr_hash = ? WHERE id = ?').run(mid.curr_hash, mid.id)
  })

  it('篡改一条 prev_hash → 下一条不匹配', () => {
    const db = getDb()
    const rows = db.prepare('SELECT id, prev_hash, curr_hash FROM audit_logs WHERE curr_hash != \'\' ORDER BY id ASC').all()
    if (rows.length < 2) return
    const second = rows[1]
    const originalPrev = second.prev_hash
    const badPrev = 'b'.repeat(64)
    db.prepare('UPDATE audit_logs SET prev_hash = ? WHERE id = ?').run(badPrev, second.id)
    const r = verifyChain()
    assert.equal(r.ok, false)
    assert.equal(r.brokenAt, second.id)
    assert.equal(r.expected, rows[0].curr_hash)
    assert.equal(r.got, badPrev)
    // 恢复
    db.prepare('UPDATE audit_logs SET prev_hash = ? WHERE id = ?').run(originalPrev, second.id)
  })

  it('computeHash 确定性：相同输入 → 相同 hash', () => {
    const h1 = computeHash('prev', { userId: 1, action: 'login', entity: 'users', entityId: '1', details: '{}', ip: '127.0.0.1', createdAt: '2026-01-01 00:00:00' })
    const h2 = computeHash('prev', { userId: 1, action: 'login', entity: 'users', entityId: '1', details: '{}', ip: '127.0.0.1', createdAt: '2026-01-01 00:00:00' })
    assert.equal(h1, h2)
    assert.equal(h1.length, 64)
  })
})