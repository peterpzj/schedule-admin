/**
 * errors.test.js
 *
 * 覆盖：
 *  - BizError 抛出后被 errorMiddleware 格式化为 { success:false, code, error, details }
 *  - HTTP 状态码正确映射
 *  - 未知 err 走 SYS_INTERNAL 500
 *  - SQLite UNIQUE 约束自动转 DB_DUPLICATE 409
 *  - ok/fail 工厂函数输出格式
 */
const assert = require('node:assert');
const { ERR, BizError, biz, ok, fail, errorMiddleware, asyncHandler } = require('./errors');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader() {}
  };
}

// 测试 1：ok/fail 工厂
{
  const r1 = ok({ a: 1 });
  assert.deepStrictEqual(r1, { success: true, data: { a: 1 } });

  const r2 = fail(ERR.SCH_CONFLICT);
  assert.strictEqual(r2.success, false);
  assert.strictEqual(r2.code, 'SCH_CONFLICT');

  const r3 = ok({ id: 1 }, { message: 'ok' });
  assert.strictEqual(r3.message, 'ok');
  console.log('✓ ok/fail 工厂');
}

// 测试 2：errorMiddleware - BizError
{
  const mw = errorMiddleware();
  const res = mockRes();
  const err = new BizError(ERR.SCH_CONFLICT, '该诊室冲突', { roomId: 101 });
  let nextCalled = false;
  mw(err, {}, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.code, 'SCH_CONFLICT');
  assert.strictEqual(res.body.error, '该诊室冲突');
  assert.deepStrictEqual(res.body.details, { roomId: 101 });
  console.log('✓ BizError → 409 + code/details');
}

// 测试 3：errorMiddleware - 未知错误
{
  const mw = errorMiddleware();
  const res = mockRes();
  mw(new Error('something broke'), {}, res, () => {});
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.code, 'SYS_INTERNAL');
  console.log('✓ 未知 err → 500 SYS_INTERNAL');
}

// 测试 4：SQLite UNIQUE 约束
{
  const mw = errorMiddleware();
  const res = mockRes();
  const err = new Error('UNIQUE constraint failed: schedules.campus_code, room_id');
  mw(err, {}, res, () => {});
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.code, 'DB_DUPLICATE');
  console.log('✓ UNIQUE 约束 → 409 DB_DUPLICATE');
}

// 测试 5：asyncHandler 捕获 reject
(async () => {
  const handler = asyncHandler(async () => {
    throw new BizError(ERR.AUTHZ_FORBIDDEN, 'no way');
  });
  const res = mockRes();
  let nextErr = null;
  await handler({}, res, (e) => { nextErr = e; });
  assert.ok(nextErr, '应将 reject 传给 next');
  assert.strictEqual(nextErr.code, 'AUTHZ_FORBIDDEN');
  console.log('✓ asyncHandler 捕获 reject');
  console.log('✓ errors.test.js 全部通过');
})().catch((e) => { console.error('✗ 失败', e); process.exit(1); });
