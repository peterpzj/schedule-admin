/**
 * 结构化 HTTP 请求日志中间件（替代 morgan）
 *
 * 每个请求完成时输出一行结构化 JSON：
 *   {
 *     ts, level, msg: 'http.request',
 *     requestId, method, route, status, durationMs,
 *     userId?, ip, ua, bytes?
 *   }
 *
 * 替代 morgan('combined') 的原因：
 *   - 与 logger.child({ requestId }) 绑定，单请求全链路关联
 *   - 字段结构化，方便 Loki / ELK 解析
 *   - 慢请求阈值可调，触发 warn
 */

const SLOW_THRESHOLD_MS = parseInt(process.env.HTTP_SLOW_THRESHOLD_MS || '2000', 10);

function pickRoute(req) {
  // 优先用 express 注册的 route.path
  if (req.route && req.route.path) {
    const base = req.baseUrl || '';
    return (base + req.route.path).replace(/[0-9]+/g, ':id');
  }
  // 兜底：从 path 抽离
  return (req.path || '/').split('?')[0].replace(/[0-9]+/g, ':id');
}

function httpLogger() {
  return function (req, res, next) {
    const startNs = process.hrtime.bigint();
    // 一些路径跳过（健康检查 / 指标）
    if (req.path === '/api/health' || req.path === '/api/version' || req.path === '/metrics') {
      return next();
    }
    res.on('finish', function () {
      const ns = Number(process.hrtime.bigint() - startNs);
      const ms = ns / 1e6;
      const route = pickRoute(req);
      const fields = {
        method: req.method,
        route: route,
        status: res.statusCode,
        durationMs: Math.round(ms * 100) / 100,
        ip: req.ip,
        ua: req.headers['user-agent'],
        bytes: Number(res.getHeader('content-length')) || undefined
      };
      if (req.user && req.user.id) fields.userId = req.user.id;
      if (!req.log) req.log = require('../lib/logger').child({ requestId: req.id });

      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      const msg = level === 'info' ? 'http.request' : (level === 'warn' ? 'http.client_error' : 'http.server_error');
      req.log[level](msg, fields);

      // 慢请求单独告警（即便状态 200）
      if (ms > SLOW_THRESHOLD_MS) {
        req.log.warn('http.slow', Object.assign({}, fields, { slowThresholdMs: SLOW_THRESHOLD_MS }));
      }
    });
    next();
  };
}

module.exports = { httpLogger, SLOW_THRESHOLD_MS };
