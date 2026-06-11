/**
 * node --test 启动钩子（每个测试文件 require 时执行）
 *  - 加载 .env.test（node --test 不自动加载 dotenv）
 *  - 清理 ./data/test.db 保证隔离
 */
const fs = require('fs')
const path = require('path')

// 1) 加载 .env.test（必须在 require server.js 之前，因为 auth.js 顶层 resolveSecret 会 exit(78)）
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') })
} catch (e) {
  // dotenv 未装（生产 only），手动 loadEnvFile 退化
  if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(path.join(__dirname, '..', '.env.test')) } catch (_) {}
  }
}

// 2) 清理 test DB（每个 fork 进程独立）
const dbPath = process.env.DB_PATH || './data/test.db'
try {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }
  for (const ext of ['-wal', '-shm']) {
    const p = dbPath + ext
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
} catch (e) {
  // ignore
}

// 3) 给默认的 test DB 路径（用 /tmp 保证每次都是新文件）
if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join('/tmp', 'schedule-test-' + process.pid + '.db')
}