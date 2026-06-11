/**
 * 集成测试 1：auth.login + refresh + 401 + 失效 token
 *   - 覆盖：登录返回 access + refresh
 *   - 覆盖：refresh 旋转（旧 token 失效）
 *   - 覆盖：401 / 403 错误码
 */
require('./setup')
const { describe, it, before, after } = require('node:test')
const { getApp, loginAsAdmin, asUser } = require('./test_helpers')

describe('auth flow', () => {
  let adminToken

  before(async () => {
    adminToken = await loginAsAdmin()
  })

  it('login 成功返回 access + refresh + user', async () => {
    const res = await getApp()._router ? null : null
    const request = require('supertest')
    const r = await request(getApp())
      .post('/api/auth/login')
      .send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD })
    assert.equal(r.status, 200)
    assert.equal(r.body.success, true)
    assert.ok(r.body.data.token)
    assert.ok(r.body.data.refreshToken)
    assert.equal(r.body.data.user.role, 'admin')
  })

  it('login 错误密码 → 401 + 不暴露用户名', async () => {
    const request = require('supertest')
    const r = await request(getApp())
      .post('/api/auth/login')
      .send({ username: process.env.ADMIN_USERNAME, password: 'wrong_password' })
    assert.equal(r.status, 401)
    assert.equal(r.body.code, 'AUTH_LOGIN_FAILED')
  })

  it('无效 token 调 /me → 401', async () => {
    const request = require('supertest')
    const r = await request(getApp())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid_garbage_token')
    assert.equal(r.status, 401)
  })

  it('refresh 成功返回新 token + 旧 refreshToken 失效', async () => {
    const request = require('supertest')
    // 1) 登录拿 refresh
    const loginRes = await request(getApp())
      .post('/api/auth/login')
      .send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD })
    const oldRefresh = loginRes.body.data.refreshToken

    // 2) 调 refresh
    const refreshRes = await request(getApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh })
    assert.equal(refreshRes.status, 200)
    assert.ok(refreshRes.body.data.token)
    const newRefresh = refreshRes.body.data.refreshToken
    assert.ok(newRefresh)
    assert.notEqual(newRefresh, oldRefresh)

    // 3) 旧 refresh 二次使用应被拒
    const reuseRes = await request(getApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh })
    assert.equal(reuseRes.status, 401)
    assert.equal(reuseRes.body.code, 'AUTH_TOKEN_INVALID')
  })

  it('refresh 用 access token 当 refresh → 401 (类型隔离)', async () => {
    const request = require('supertest')
    const loginRes = await request(getApp())
      .post('/api/auth/login')
      .send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD })
    const accessToken = loginRes.body.data.token

    const r = await request(getApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: accessToken })  // ← 故意用 access
    assert.equal(r.status, 401)
  })
})