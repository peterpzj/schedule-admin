/**
 * 结构化 JSON 日志器（无第三方依赖）
 *
 * 特性：
 *   - 输出 JSON 到 stdout / stderr（容器友好）
 *   - 支持级别：debug / info / warn / error
 *   - 支持子 logger（child）：绑定上下文字段
 *   - 内置 requestId、userId、durationMs 字段
 *   - 错误对象自动序列化（含 stack、name、message）
 *
 * 用法：
 *   const logger = require('./lib/logger');
 *   logger.info('user.login', { userId: 1 });
 *   const log = logger.child({ requestId: 'r-123' });
 *   log.warn('slow.query', { durationMs: 1500 });
 *
 * 环境变量：
 *   LOG_LEVEL   debug | info | warn | error（默认 info）
 *   LOG_PRETTY  true = 输出人类可读格式（开发用）
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const DEFAULT_LEVEL = process.env.LOG_LEVEL && LEVELS[process.env.LOG_LEVEL] !== undefined
  ? LEVELS[process.env.LOG_LEVEL]
  : LEVELS.info;
const PRETTY = (process.env.LOG_PRETTY || '').toLowerCase() === 'true';

class Logger {
  constructor(bindings, level) {
    this.bindings = bindings || {};
    this.level = level === undefined ? DEFAULT_LEVEL : level;
  }

  child(extra) {
    return new Logger(Object.assign({}, this.bindings, extra || {}), this.level);
  }

  setLevel(level) {
    if (typeof level === 'string') level = LEVELS[level];
    if (typeof level === 'number') this.level = level;
  }

  _write(level, msg, fields, err) {
    if (LEVELS[level] < this.level) return;
    const payload = Object.assign({
      ts: new Date().toISOString(),
      level: level,
      msg: msg
    }, this.bindings, fields || {});
    if (err) {
      payload.err = {
        name: err.name,
        message: err.message,
        code: err.code,
        stack: err.stack
      };
    }
    const line = PRETTY ? this._pretty(payload) : JSON.stringify(payload);
    const stream = level === 'error' ? process.stderr : process.stdout;
    try { stream.write(line + '\n'); } catch (_) { /* ignore broken pipe */ }
  }

  _pretty(p) {
    const ts = p.ts;
    const lv = p.level.toUpperCase().padEnd(5);
    const ctx = Object.keys(p)
      .filter(function (k) { return k !== 'ts' && k !== 'level' && k !== 'msg'; })
      .map(function (k) { return k + '=' + (typeof p[k] === 'object' ? JSON.stringify(p[k]) : p[k]); })
      .join(' ');
    return ts + ' ' + lv + ' ' + (ctx ? '[' + ctx + '] ' : '') + p.msg;
  }

  debug(msg, fields) { this._write('debug', msg, fields); }
  info(msg, fields) { this._write('info', msg, fields); }
  warn(msg, fields, err) { this._write('warn', msg, fields, err); }
  error(msg, fields, err) { this._write('error', msg, fields, err); }
}

// 单例 root logger
const root = new Logger({ service: 'schedule-admin-api' });

module.exports = root;
module.exports.Logger = Logger;
module.exports.LEVELS = LEVELS;
