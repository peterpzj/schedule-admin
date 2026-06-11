/**
 * 测试 helper：启动 express app 用 supertest 打
 *   - 每个测试文件独立进程 + 独立 DB
 *   - 不依赖任何外部网络
 */
const path = require('path')

// 必须先加载环境变量，再 require server.js（server.js 顶层 resolveSecret 会 exit）
process.env.NODE_ENV = 'test'
process.env.DB_PATH = process.env.DB_PATH || ('./data/test-' + process.pid + '.db')
process.env.STORE_BACKEND = process.env.STORE_BACKEND || 'memory'
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'

let app

function getApp() {
  if (!app) {
    // 延迟 require：让环境变量先生效
    delete require.cache[require.resolve('../server.js')]
    app = require('../server.js')
  }
  return app
}

async function loginAsAdmin() {
  const request = require('supertest')
  const res = await request(getApp())
    .post('/api/auth/login')
    .send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD })
  if (!res.body.success) {
    throw new Error('admin login failed: ' + JSON.stringify(res.body))
  }
  return res.body.data.token
}

function asUser(token) {
  const request = require('supertest')
  return {
    get: (url) => request(getApp()).get(url).set('Authorization', 'Bearer ' + token),
    post: (url) => request(getApp()).post(url).set('Authorization', 'Bearer ' + token),
    put: (url) => request(getApp()).put(url).set('Authorization', 'Bearer ' + token),
    del: (url) => request(getApp()).delete(url).set('Authorization', 'Bearer ' + token)
  }
}

module.exports = { getApp, loginAsAdmin, asUser }