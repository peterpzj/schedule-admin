/**
 * Request ID + per-request logger 中间件
 *
 *   - 为每个请求生成短 ID（16 hex）
 *   - 优先使用上游 X-Request-Id（便于跨服务追踪）
 *   - req.id / req.log 注入到请求对象
 *   - 响应头 X-Request-Id 返回给客户端
 *   - 监听 res.on('finish') 不在这里（httpLogger 负责）
 */

const crypto = require('crypto');
const rootLogger = require('../lib/logger');

const HEADER = 'x-request-id';

function newId() {
  return crypto.randomBytes(8).toString('hex'); // 16 字符，足够排障
}

function requestId() {
  return function (req, res, next) {
    const incoming = req.headers[HEADER];
    req.id = (typeof incoming === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming))
      ? incoming
      : newId();
    res.setHeader('X-Request-Id', req.id);
    req.log = rootLogger.child({ requestId: req.id });
    next();
  };
}

module.exports = { requestId, newId };
