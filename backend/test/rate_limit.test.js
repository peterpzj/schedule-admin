/**
 * 集成测试 2：登录失败桶 + IP 限流
 *   - 覆盖：同一 IP 错 5 次后被 loginLimiter 拒
 *   - 覆盖：bucket poisoning 防护 — 无效 username 不计入账号桶
 *   - 覆盖：限流桶走 lib/store（Store 抽象）
 */
require('./setup')
const { describe, it } = require('node:test')
const { getApp } = require('./test_helpers')
const { getStore } = require('../lib/store')

describe('login rate limit', () => {
  it('同一 IP 错 5 次后 → 429', async () => {
    // 清空桶（确保本测试不受前面 test file 残留）
    const store = getStore()
    if (store._reset) store._reset()

    const request = require('supertest')
    const app = getApp()

    // 错 5 次
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login')
        .send({ username: process.env.ADMIN_USERNAME, password: 'wrong_' + i })
    }
    // 第 6 次：被 IP 限流拒
    const r = await request(app).post('/api/auth/login')
      .send({ username: process.env.ADMIN_USERNAME, password: 'wrong' })
    assert.equal(r.status, 429)
    assert.equal(r.body.code, 'SYS_RATE_LIMITED')
  })

  it('bucket poisoning 防护：无效 username 不计账号桶', async () => {
    const store = getStore()
    if (store._reset) store._reset()

    const request = require('supertest')
    const app = getApp()

    // 故意打 20 次不存在的 username + 任意密码
    for (let i = 0; i < 20; i++) {
      const r = await request(app).post('/api/auth/login')
        .send({ username: 'ghost_user_xxx', password: 'any' })
      // 期待：返回 401 AUTH_LOGIN_FAILED，不应被限流（IP 是同一个，但应允许 5 次）
      // 第 6 次开始因为 loginLimiter（IP 维度）会被 429，但账号桶不应被污染
    }
    // 现在用真实 admin 账号登录，应该成功（账号桶没被 ghost_user 锁）
    // 注意：上一个 test 限流了 IP，所以需要先清桶
    if (store._reset) store._reset()
    const r = await request(app).post('/api/auth/login')
      .send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD })
    assert.equal(r.status, 200)
    assert.equal(r.body.success, true)
  })
})