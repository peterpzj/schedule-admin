/**
 * 单元测试：lib/store.js (MemoryStore)
 *   - get / set / del / has
 *   - TTL 过期
 *   - cleanup() 清理过期 key
 *   - 不需要 better-sqlite3（纯 in-memory）
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { MemoryStore, createStore } = require('./store')

describe('MemoryStore', () => {
  test('set / get 正常读写', () => {
    const s = new MemoryStore()
    s.set('k1', { count: 5, resetAt: 12345 })
    const got = s.get('k1')
    assert.equal(got.value.count, 5)
    assert.equal(got.value.resetAt, 12345)
  })

  test('has() 不存在的 key 返回 false', () => {
    const s = new MemoryStore()
    assert.equal(s.has('nope'), false)
  })

  test('del() 删除后 has() 返回 false', () => {
    const s = new MemoryStore()
    s.set('k', 'v', 60000)
    assert.equal(s.has('k'), true)
    s.del('k')
    assert.equal(s.has('k'), false)
  })

  test('TTL 过期后 get() 返回 null', async () => {
    const s = new MemoryStore()
    s.set('short', 'value', 30)  // 30ms
    assert.ok(s.get('short'))
    await new Promise(r => setTimeout(r, 60))
    assert.equal(s.get('short'), null)
  })

  test('TTL=0 永不过期', async () => {
    const s = new MemoryStore()
    s.set('forever', 'value', 0)
    assert.equal(s.has('forever'), true)
    await new Promise(r => setTimeout(r, 50))
    assert.equal(s.has('forever'), true)
  })

  test('cleanup() 清理所有过期 key', () => {
    const s = new MemoryStore()
    s.set('a', 1, 1)  // 1ms TTL
    s.set('b', 2, 60000)
    return new Promise(resolve => {
      setTimeout(() => {
        s.cleanup()
        assert.equal(s.has('a'), false)
        assert.equal(s.has('b'), true)
        s.close()
        resolve()
      }, 30)
    })
  })

  test('createStore({ backend: "memory" }) 走 MemoryStore', () => {
    const s = createStore({ backend: 'memory' })
    assert.ok(s instanceof MemoryStore)
  })
})
