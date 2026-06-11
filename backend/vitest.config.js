/**
 * Vitest 配置
 *
 * 测试范围：
 *   - 单元测试：lib/*.js 纯函数（errors / csv / store / roles / audit hash）
 *   - 集成测试：test/integration/*.test.js（启动 server，用 supertest 打 HTTP）
 *
 * 环境变量：
 *   - JWT_SECRET_CURRENT / JWT_SECRET / ADMIN_USERNAME / ADMIN_PASSWORD 必须在 .env.test 里设
 *   - DB_PATH 默认指向 ./data/test.db（每个测试文件隔离）
 *   - STORE_BACKEND=memory（测试不用持久化）
 */
const path = require('path')
const { defineConfig } = require('vitest/config')

require('dotenv').config({ path: path.join(__dirname, '.env.test') })

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',         // 每个 test file 一个进程，避免 better-sqlite3 文件锁冲突
    poolOptions: {
      forks: { singleFork: false }
    },
    // include：本次新写的 5 个集成测试 + test 目录
    // exclude：lib/ 下的老 node --test 风格脚本（不是 vitest 套件），等后续 PR 迁移
    include: ['test/**/*.test.js'],
    exclude: ['node_modules/**', 'lib/**/*.test.js']
  }
})