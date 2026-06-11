/**
 * 单元测试：middleware/audit.js 的 hash 链纯逻辑
 *   - computeHash 确定性
 *   - 对所有字段敏感
 *   - GENESIS 起点
 *   - 不需要数据库
 *
 * 注意：verifyChain() 涉及 DB 操作，留给集成测试 (test/audit_chain.test.js)
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { computeHash, GENESIS_HASH } = require('./audit')

describe('audit.computeHash', () => {
  const base = {
    userId: 1, action: 'login', entity: 'users', entityId: '1',
    details: '{}', ip: '127.0.0.1', createdAt: '2026-06-11 00:00:00'
  }

  test('GENESIS 起点', () => {
    assert.equal(GENESIS_HASH, 'GENESIS')
  })

  test('返回 64 字符 hex（SHA-256）', () => {
    const h = computeHash(GENESIS_HASH, base)
    assert.equal(h.length, 64)
    assert.match(h, /^[a-f0-9]+$/)
  })

  test('同输入 → 同 hash（确定性）', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash(GENESIS_HASH, base)
    assert.equal(a, b)
  })

  test('prevHash 不同 → hash 不同', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash('another_prev', base)
    assert.notEqual(a, b)
  })

  test('userId 不同 → hash 不同', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash(GENESIS_HASH, { ...base, userId: 2 })
    assert.notEqual(a, b)
  })

  test('action 不同 → hash 不同', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash(GENESIS_HASH, { ...base, action: 'logout' })
    assert.notEqual(a, b)
  })

  test('entity 不同 → hash 不同', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash(GENESIS_HASH, { ...base, entity: 'schedules' })
    assert.notEqual(a, b)
  })

  test('entityId 不同 → hash 不同', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash(GENESIS_HASH, { ...base, entityId: '2' })
    assert.notEqual(a, b)
  })

  test('details 不同 → hash 不同', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash(GENESIS_HASH, { ...base, details: '{"x":1}' })
    assert.notEqual(a, b)
  })

  test('ip 不同 → hash 不同', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash(GENESIS_HASH, { ...base, ip: '10.0.0.1' })
    assert.notEqual(a, b)
  })

  test('createdAt 不同 → hash 不同', () => {
    const a = computeHash(GENESIS_HASH, base)
    const b = computeHash(GENESIS_HASH, { ...base, createdAt: '2026-06-11 00:00:01' })
    assert.notEqual(a, b)
  })

  test('字段缺失 → 用空字符串兜底，不抛错', () => {
    const h = computeHash(GENESIS_HASH, {})
    assert.equal(h.length, 64)
  })

  test('链式：连续 3 条 hash 都不相同（递增难度）', () => {
    const h0 = computeHash(GENESIS_HASH, base)
    const h1 = computeHash(h0, { ...base, userId: 2 })
    const h2 = computeHash(h1, { ...base, userId: 3 })
    assert.notEqual(h0, h1)
    assert.notEqual(h1, h2)
    assert.notEqual(h0, h2)
  })
})
