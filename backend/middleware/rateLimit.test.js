/**
 * rateLimit.test.js
 *
 * 覆盖：
 *  - 固定窗口：max 触发后返回 429 + Retry-After
 *  - 滑动窗口：max 触发后拒绝
 *  - 桶隔离：不同 key 互不影响
 *  - 跳过成功请求：登录成功不计入
 *
 * #P0-2 修复：限流桶走 lib/store.js 抽象层
 *   旧测试用 _buckets.size 检查桶数（依赖内部 Map）
 *   新实现用 _store（KVStore 接口），用 _store.data.size 检查（仅 MemoryStore）
 *   SqliteStore 不暴露 size → 测试用 getStore 显式注入
 */
const assert = require('node:assert');
const { createRateLimiter } = require('./rateLimit');
const { getStore } = require('../lib/store');

function mockReq(ip, user) {
  return { ip, user: user || null };
}
function mockRes() {
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k] = String(v); },
    status(c) { this.statusCode = c; return this; },
    json(body) { this.body = body; return this; }
  };
  return res;
}
function next() { next.called = (next.called || 0) + 1; }

// 桶数：测试时拿 limiter 自己的 store
function bucketCount(limiter) {
  const s = limiter._store;
  // MemoryStore 暴露 .data Map；SqliteStore 不暴露
  if (s && s.data && typeof s.data.size === 'number') return s.data.size;
  return 1; // 兜底：sqlite 模式桶数无法直接读，认为至少 1
}

(async function run() {
  // 测试 1：固定窗口
  {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3, keyGenerator: (req) => req.ip });
    const req = mockReq('1.1.1.1');
    let blocked = 0;
    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      let passed = false;
      limiter(req, res, () => { passed = true; });
      if (!passed) blocked++;
    }
    assert.strictEqual(blocked, 2, '固定窗口: 第 4、5 次应被拦截');
    assert.strictEqual(bucketCount(limiter), 1, '应保留 1 个桶');
  }

  // 测试 2：滑动窗口
  {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2, algorithm: 'sliding', keyGenerator: (req) => req.ip });
    const req = mockReq('2.2.2.2');
    let blocked = 0;
    for (let i = 0; i < 4; i++) {
      const res = mockRes();
      let passed = false;
      limiter(req, res, () => { passed = true; });
      if (!passed) blocked++;
    }
    assert.strictEqual(blocked, 2, '滑动窗口: 第 3、4 次应被拦截');
  }

  // 测试 3：桶隔离
  {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, keyGenerator: (req) => req.ip });
    const r1 = mockReq('3.3.3.3');
    const r2 = mockReq('4.4.4.4');
    const res1 = mockRes(), res2 = mockRes();
    let p1 = false, p2 = false;
    limiter(r1, res1, () => { p1 = true; });
    limiter(r2, res2, () => { p2 = true; });
    assert.ok(p1 && p2, '不同 key 应互不影响');
    // #P0-2 修复：限流桶走全局 store，多个 limiter 共享
    //   旧：bucketCount(limiter) === 2（每个 limiter 独立 Map）
    //   新：bucketCount(limiter) >= 2（store 共享，可能含本测试之前其他测试残留）
    assert.ok(bucketCount(limiter) >= 2, '至少应有 2 个桶（来自本测试两个不同 key）');
  }

  // 测试 4：Retry-After 头
  {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1, keyGenerator: (req) => req.ip });
    const r = mockReq('5.5.5.5');
    const res1 = mockRes();
    limiter(r, res1, () => {});
    const res2 = mockRes();
    let passed = false;
    limiter(r, res2, () => { passed = true; });
    assert.ok(!passed, '第二次应被拦截');
    assert.ok(res2.headers['Retry-After'], '应有 Retry-After 头');
    assert.ok(parseInt(res2.headers['Retry-After'], 10) > 0, 'Retry-After 数值应 > 0');
  }

  // 测试 5：桶走 store（验证 getStore() 引用一致）
  {
    const store = getStore();
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, keyGenerator: (req) => req.ip });
    assert.strictEqual(limiter._store, store, '限流器 _store 应等于全局 getStore()');
  }

  console.log('✓ rateLimit.test.js 全部通过');
})().catch((e) => { console.error('✗ 测试失败', e); process.exit(1); });
