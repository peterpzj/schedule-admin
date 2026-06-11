/**
 * 单元测试：lib/auditVerify.js
 *   - renderReport 两种模式 (human / json)
 *   - 不依赖数据库（mock verifyWithStats 输入）
 *
 * 注意：本文件用 node --test 风格（与 test/ 目录一致）
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { renderReport } = require('./auditVerify')

describe('auditVerify.renderReport', () => {
  test('human 模式：链完整 → 包含 ✅', () => {
    const stats = {
      ok: true, total: 100, skipped: 5, brokenAt: null, expected: null, got: null,
      error: null, firstId: 1, lastId: 200, range: [1, 200]
    }
    const out = renderReport(stats, { human: true })
    assert.match(out, /✅/)
    assert.match(out, /参与校验.*100/)
    assert.match(out, /跳过.*5/)
    assert.match(out, /id 1 → 200/)
  })

  test('human 模式：链断裂 → 包含 brokenAt + expected/got', () => {
    const stats = {
      ok: false, total: 50, skipped: 0, brokenAt: 42,
      expected: 'abc123', got: 'def456',
      error: null, firstId: 1, lastId: 100, range: [1, 100]
    }
    const out = renderReport(stats, { human: true })
    assert.match(out, /❌/)
    assert.match(out, /断裂位置.*42/)
    assert.match(out, /期望.*abc123/)
    assert.match(out, /实际.*def456/)
  })

  test('human 模式：error 字段有值 → 显示错误', () => {
    const stats = {
      ok: false, total: 0, skipped: 0, brokenAt: null, expected: null, got: null,
      error: 'DB locked', firstId: null, lastId: null, range: null
    }
    const out = renderReport(stats, { human: true })
    assert.match(out, /错误.*DB locked/)
  })

  test('JSON 模式：返回可解析 JSON', () => {
    const stats = {
      ok: true, total: 10, skipped: 0, brokenAt: null, expected: null, got: null,
      error: null, firstId: 1, lastId: 10, range: [1, 10]
    }
    const out = renderReport(stats, { human: false })
    const parsed = JSON.parse(out)
    assert.equal(parsed.ok, true)
    assert.equal(parsed.total, 10)
    assert.deepEqual(parsed.range, [1, 10])
  })

  test('默认模式：human=true（不传 opts）', () => {
    const stats = {
      ok: true, total: 1, skipped: 0, brokenAt: null, expected: null, got: null,
      error: null, firstId: 1, lastId: 1, range: [1, 1]
    }
    const out = renderReport(stats)  // 不传 opts
    assert.match(out, /✅/)  // 默认 human 模式
  })
})
