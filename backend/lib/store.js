/**
 * #P0-2 修复：KV 存储抽象层
 *
 * 背景：
 *   - 当前 tokenBlacklist (auth.js) 和 限流桶 (rateLimit.js) 都是 Map<key, {exp}>
 *   - 进程重启即丢失，攻击者借重启窗口绕过
 *   - 多实例部署时各进程独立计数 → 限流变弱
 *
 * 设计：
 *   - 一个抽象接口 KVStore { get, set, del, has, cleanup }
 *   - 默认实现 MemoryStore（进程内 Map，TTL 过期）
 *   - 可选 SqliteStore（持久化到 SQLite，跨进程 + 跨重启）
 *   - 通过 createStore(opts) 工厂函数选择，env 变量控制
 *
 * 用法：
 *   const store = require('./lib/store')
 *   const s = store.createStore({ backend: process.env.STORE_BACKEND || 'memory' })
 *   s.set('login:foo', 1, 15 * 60 * 1000)
 *   s.get('login:foo') // → { value: 1, exp: ... }
 *
 * 选 memory 的场景：
 *   - 单实例部署（当前 docker-compose 是单实例）
 *   - 测试环境
 * 选 sqlite 的场景：
 *   - 多实例部署（HA / k8s）
 *   - 重启不能丢（合规要求）
 *
 * env 变量：
 *   STORE_BACKEND=memory | sqlite （默认 memory）
 *   STORE_SQLITE_PATH=./data/store.db （sqlite 模式）
 */

const { getDb } = require('../db')
const log = require('./logger')

/**
 * 抽象基类
 */
class KVStore {
  /**
   * @param {string} key
   * @returns {{value: any, exp: number}|null}
   */
  get(key) { throw new Error('not implemented') }

  /**
   * @param {string} key
   * @param {any} value  JSON-serializable
   * @param {number} ttlMs  0 = 永不过期
   */
  set(key, value, ttlMs = 0) { throw new Error('not implemented') }

  del(key) { throw new Error('not implemented') }

  has(key) { throw new Error('not implemented') }

  /** 清理过期 key（通常定时调用） */
  cleanup() {}

  /** 关闭连接（Sqlite 需要，Memory noop） */
  close() {}
}

/**
 * 内存实现：进程内 Map + 定时清理
 * 适用：单实例 / 测试
 */
class MemoryStore extends KVStore {
  constructor() {
    super()
    this.data = new Map()
    // 5 分钟清理一次过期 key
    this._timer = setInterval(() => this.cleanup(), 5 * 60 * 1000)
    if (typeof this._timer.unref === 'function') this._timer.unref()
  }

  get(key) {
    const entry = this.data.get(key)
    if (!entry) return null
    if (entry.exp && entry.exp <= Date.now()) {
      this.data.delete(key)
      return null
    }
    return entry
  }

  set(key, value, ttlMs = 0) {
    const exp = ttlMs > 0 ? Date.now() + ttlMs : 0
    this.data.set(key, { value, exp })
  }

  del(key) { this.data.delete(key) }

  has(key) { return this.get(key) !== null }

  cleanup() {
    const now = Date.now()
    for (const [k, e] of this.data) {
      if (e.exp && e.exp <= now) this.data.delete(k)
    }
  }

  close() {
    if (this._timer) clearInterval(this._timer)
  }
}

/**
 * SQLite 实现：持久化到独立 store.db 文件
 * 适用：多实例 / 重启保留
 *
 * 表结构：
 *   CREATE TABLE kv_store (
 *     key TEXT PRIMARY KEY,
 *     value TEXT,           -- JSON
 *     exp INTEGER NOT NULL   -- 0 = 永不过期
 *   )
 */
class SqliteStore extends KVStore {
  constructor(dbPath) {
    super()
    const path = dbPath || process.env.STORE_SQLITE_PATH || './data/store.db'
    // 独立连接，避免与主库 db 争用
    const Database = require('better-sqlite3')
    const fs = require('fs')
    const dir = require('path').dirname(path)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.exec(`CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      exp INTEGER NOT NULL DEFAULT 0
    )`)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_kv_store_exp ON kv_store(exp) WHERE exp > 0')
    // 清理：定期 GC 过期 key
    this._timer = setInterval(() => this.cleanup(), 5 * 60 * 1000)
    if (typeof this._timer.unref === 'function') this._timer.unref()
    log.info('store.sqlite.opened', { path })
  }

  get(key) {
    const row = this.db.prepare('SELECT value, exp FROM kv_store WHERE key = ?').get(key)
    if (!row) return null
    if (row.exp && row.exp <= Date.now()) {
      this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key)
      return null
    }
    try {
      return { value: JSON.parse(row.value), exp: row.exp }
    } catch (_) {
      return null
    }
  }

  set(key, value, ttlMs = 0) {
    const exp = ttlMs > 0 ? Date.now() + ttlMs : 0
    const v = JSON.stringify(value)
    this.db.prepare(`
      INSERT INTO kv_store (key, value, exp) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, exp = excluded.exp
    `).run(key, v, exp)
  }

  del(key) {
    this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key)
  }

  has(key) { return this.get(key) !== null }

  cleanup() {
    try {
      const info = this.db.prepare('DELETE FROM kv_store WHERE exp > 0 AND exp <= ?').run(Date.now())
      if (info.changes > 0) log.info('store.sqlite.cleanup', { removed: info.changes })
    } catch (e) {
      log.warn('store.sqlite.cleanup.failed', { err: e.message })
    }
  }

  close() {
    if (this._timer) clearInterval(this._timer)
    try { this.db.close() } catch (_) {}
  }
}

/**
 * 全局单例（懒加载，避免启动时打开 Sqlite）
 */
let _instance = null
function createStore(opts = {}) {
  if (_instance) return _instance
  const backend = (opts.backend || process.env.STORE_BACKEND || 'memory').toLowerCase()
  if (backend === 'sqlite') {
    _instance = new SqliteStore(opts.path)
  } else if (backend === 'memory') {
    _instance = new MemoryStore()
  } else {
    log.warn('store.unknown_backend', { backend, fallback: 'memory' })
    _instance = new MemoryStore()
  }
  return _instance
}

function getStore() {
  return _instance || createStore()
}

module.exports = {
  KVStore,
  MemoryStore,
  SqliteStore,
  createStore,
  getStore
}