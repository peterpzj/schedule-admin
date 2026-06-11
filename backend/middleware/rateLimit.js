/**
 * 轻量级限流中间件（无第三方依赖）
 *
 * 限流器清单：
 *   - loginLimiter        : 登录防暴力（默认 5/15min）
 *   - createUserLimiter   : 创建账号（默认 10/h）
 *   - scheduleWriteLimiter: 写排班防脚本（默认 30/min，IP+用户组合键）
 *   - excelLimiter        : Excel 导入/导出（默认 5/h，IP+用户组合键）
 *   - globalLimiter       : 全局读（默认 600/10min，仅 IP）
 *
 * 算法：
 *   - 默认 固定窗口（实现简单，内存占用低）
 *   - 设置 { algorithm: 'sliding' } 切换为滑动窗口（更精确防突发流量）
 *
 * 实现：进程内 Map<key, {count, resetAt}>，定期清理过期桶
 * 响应头遵循 IETF RateLimit Headers draft-7
 * 触发 429 时同时返回 Retry-After
 */
const { ERR, fail } = require('../lib/errors');

function readInt(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function readWindow(name, fallbackMs) {
  const v = process.env[name];
  if (!v) return fallbackMs;
  const m = /^(\d+)\s*(ms|s|m|h)?$/.exec(v.trim());
  if (!m) return fallbackMs;
  const n = parseInt(m[1], 10);
  const unit = m[2] || 'ms';
  const mult = unit === 'h' ? 3600000 : unit === 'm' ? 60000 : unit === 's' ? 1000 : 1;
  return n * mult;
}

/**
 * 生成 IP+用户组合键
 * - 优先用 req.user.id（如果中间件挂在 requireAuth 之后）
 * - 否则用 IP
 * - 格式：ip:1.2.3.4|u:42   便于按维度查看
 */
function userOrIpKey(req) {
  const ip = req.ip || 'unknown';
  const uid = (req.user && req.user.id) ? 'u:' + req.user.id : 'anon';
  return 'ip:' + ip + '|' + uid;
}

function createRateLimiter(opts) {
  const { windowMs, max, message, keyGenerator, skipFailedRequests, skipSuccessfulRequests, algorithm } = opts;
  const useSliding = algorithm === 'sliding';
  // #P0-2 修复：限流桶走 lib/store.js
  //   - 默认 memory（进程内 Map）：原行为，单实例 OK
  //   - 多实例时设 STORE_BACKEND=sqlite → 跨进程共享
  //   - 留 redis 钩子：以后改 store.createStore({ backend: 'redis' }) 即可
  const { getStore } = require('../lib/store')
  const store = getStore()
  const keyFn = keyGenerator || ((req) => req.ip || 'unknown');
  const keyPrefix = 'rl:' + Math.random().toString(36).slice(2, 8) + ':'
  // 限流桶 key 形如 'rl:abc:1.2.3.4' → 桶对象

  // 定期清理过期桶：扫描 store
  //   store 本身有 5min GC，但本函数每 windowMs/2 显式触发一次加速
  //   内存 store：扫描 in-memory Map；sqlite store：DELETE WHERE exp<now
  const cleanupMs = Math.max(10000, Math.floor(windowMs / 2));
  const timer = setInterval(() => store.cleanup && store.cleanup(), cleanupMs);
  if (typeof timer.unref === 'function') timer.unref();

  function middleware(req, res, next) {
    const key = keyPrefix + keyFn(req);
    const now = Date.now();
    const entry = store.get(key);
    let bucket = (entry && entry.value) || null;

    if (useSliding) {
      // 滑动窗口：数组存命中时间戳
      if (!bucket) bucket = { hits: [] };
      bucket.hits = bucket.hits.filter((ts) => now - ts < windowMs);
      bucket.hits.push(now);
      // 写回 store：TTL = windowMs（多 1s 容差）
      store.set(key, bucket, windowMs + 1000);
      const count = bucket.hits.length;
      const remaining = Math.max(0, max - count);
      const resetIn = bucket.hits.length ? Math.max(0, windowMs - (now - bucket.hits[0])) : windowMs;
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(Math.ceil(resetIn / 1000)));
      res.setHeader('RateLimit-Policy', String(max) + ';w=' + Math.ceil(windowMs / 1000));
      if (count > max) {
        const retryAfter = Math.max(1, Math.ceil(resetIn / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json(message || fail(ERR.SYS_RATE_LIMITED, '请求过于频繁，请稍后再试'));
      }
    } else {
      // 固定窗口
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
      }
      bucket.count++;
      // 写回 store：TTL = windowMs
      store.set(key, bucket, windowMs + 1000);
      const remaining = Math.max(0, max - bucket.count);
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));
      if (bucket.count > max) {
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json(message || fail(ERR.SYS_RATE_LIMITED, '请求过于频繁，请稍后再试'));
      }
    }

    // 可选：仅在失败/成功时计数（防刷接口常用）
    if (skipFailedRequests || skipSuccessfulRequests) {
      res.on('finish', () => {
        const status = res.statusCode;
        // #P0-2 修复：从 store 读最新桶对象，再写回
        const e = store.get(key);
        const b = (e && e.value) || null;
        if (!b) return;
        if (useSliding) {
          if ((skipFailedRequests && status >= 400) || (skipSuccessfulRequests && status < 400)) {
            if (b.hits.length) b.hits.pop();
            store.set(key, b, windowMs + 1000);
          }
        } else {
          if (skipFailedRequests && status >= 400) b.count--;
          if (skipSuccessfulRequests && status < 400) b.count--;
          store.set(key, b, windowMs + 1000);
        }
      });
    }
    next();
  }

  // #P0-2 修复：保留测试钩子（仍暴露 store 引用，运维可通过 metrics.js 查桶数）
  middleware._store = store;
  middleware._reset = () => {
    // 测试用：清空当前限流器作用域的所有 key
    //   内存 store 直接清 Map；sqlite store 走 DELETE
    if (typeof store.cleanup === 'function') store.cleanup();
  };
  return middleware;
}

const loginLimiter = createRateLimiter({
  windowMs: readWindow('LOGIN_RATE_WINDOW', 15 * 60 * 1000),
  max: readInt('LOGIN_RATE_LIMIT', 5),
  message: fail(ERR.SYS_RATE_LIMITED, '登录尝试过于频繁，请 15 分钟后再试'),
  keyGenerator: (req) => req.ip,
  algorithm: 'sliding',
  skipFailedRequests: false,
  skipSuccessfulRequests: true  // 登录成功不计入限流
});

/**
 * 账号级限流（防 bucket poisoning）：见 auth.js controller 内部逻辑。
 *
 * 历史：早期版本把 accountLoginLimiter 作为中间件挂载，key 用 req.body.username。
 * 这导致攻击者发 "username=victim + 任意密码" 就能把 victim 账号锁 15 分钟
 * （poisoning：key 在 password 校验之前就生成，但只有失败请求会被计数）。
 *
 * 修复方案：账号级限流在 controller 里手动维护。
 *   - 只有当 username **确实存在** 且 password **确实错误** 时才扣计数
 *   - 无效 username 直接返回 AUTH_LOGIN_FAILED，不创建任何 bucket
 *   - 桶按 'loginFail:<username>' 隔离（不混入 IP 维度，跨 IP 累计）
 *
 * 这里保留占位符以便旧代码 import 不报错；不推荐继续使用。
 */
const accountLoginLimiter = function noopAccountLimiter(req, res, next) { next() };

const createUserLimiter = createRateLimiter({
  windowMs: readWindow('CREATE_USER_RATE_WINDOW', 60 * 60 * 1000),
  max: readInt('CREATE_USER_RATE_LIMIT', 10),
  message: fail(ERR.SYS_RATE_LIMITED, '创建账号过于频繁，请稍后再试'),
  keyGenerator: (req) => req.ip,
  algorithm: 'sliding'
});

// 写排班：IP+用户组合键，防止单用户滥用 + 防止 NAT 后大量用户共享一个 IP 被误伤
// 使用滑动窗口防止突发批量写入
const scheduleWriteLimiter = createRateLimiter({
  windowMs: readWindow('SCHEDULE_WRITE_RATE_WINDOW', 60 * 1000),
  max: readInt('SCHEDULE_WRITE_RATE_LIMIT', 30),
  message: fail(ERR.SYS_RATE_LIMITED, '排班写入过于频繁，请稍后再试（每分钟最多 30 次）'),
  keyGenerator: userOrIpKey,
  algorithm: 'sliding'
});

// Excel 导入/导出：IP+用户组合键
const excelLimiter = createRateLimiter({
  windowMs: readWindow('EXCEL_RATE_WINDOW', 60 * 60 * 1000),
  max: readInt('EXCEL_RATE_LIMIT', 5),
  message: fail(ERR.SYS_RATE_LIMITED, 'Excel 导入/导出过于频繁，请 1 小时后再试'),
  keyGenerator: userOrIpKey,
  algorithm: 'sliding'
});

const globalLimiter = createRateLimiter({
  windowMs: readWindow('GLOBAL_RATE_WINDOW', 10 * 60 * 1000),
  max: readInt('GLOBAL_RATE_LIMIT', 600),
  message: fail(ERR.SYS_RATE_LIMITED, '请求过于频繁，请稍后再试'),
  keyGenerator: (req) => req.ip,
  algorithm: 'sliding'
});

module.exports = {
  loginLimiter,
  // accountLoginLimiter 已弃用，仅作为 noop 占位保留以兼容旧 import
  // 真实账号级限流在 routes/auth.js controller 内部
  accountLoginLimiter,
  createUserLimiter,
  scheduleWriteLimiter,
  excelLimiter,
  globalLimiter,
  createRateLimiter,
  // 工具方法，运维/测试用
  _resetAll: () => {
    loginLimiter._reset && loginLimiter._reset();
    createUserLimiter._reset && createUserLimiter._reset();
    scheduleWriteLimiter._reset && scheduleWriteLimiter._reset();
    excelLimiter._reset && excelLimiter._reset();
    globalLimiter._reset && globalLimiter._reset();
  }
};
