/**
 * 统一错误码体系
 *
 * 设计原则：
 *  - 业务错误码稳定可枚举，前端按 code 分支处理（不再依赖中文字符串匹配）
 *  - HTTP 状态码 = 默认映射，可在抛出时覆盖
 *  - 错误 message 用于人工查看，code 用于程序处理
 *
 * 错误码分组：
 *  - AUTH_*  : 鉴权/登录
 *  - AUTHZ_* : 授权/权限
 *  - VAL_*   : 入参校验
 *  - SCH_*   : 排班业务
 *  - META_*  : 基础数据
 *  - EXC_*   : Excel 导入导出
 *  - DB_*    : 数据库
 *  - SYS_*   : 系统级
 */

const log = require('./logger');

const ERR = {
  // 鉴权
  AUTH_TOKEN_MISSING:   { code: 'AUTH_TOKEN_MISSING',   http: 401, message: '未提供登录凭证' },
  AUTH_TOKEN_INVALID:   { code: 'AUTH_TOKEN_INVALID',   http: 401, message: 'Token 无效或已过期' },
  AUTH_TOKEN_EXPIRED:   { code: 'AUTH_TOKEN_EXPIRED',   http: 401, message: 'Token 已过期，请重新登录' },
  AUTH_LOGIN_FAILED:    { code: 'AUTH_LOGIN_FAILED',    http: 401, message: '账号或密码错误' },
  AUTH_USER_DISABLED:   { code: 'AUTH_USER_DISABLED',   http: 403, message: '账号已停用' },

  // 权限
  AUTHZ_FORBIDDEN:      { code: 'AUTHZ_FORBIDDEN',      http: 403, message: '无权限执行此操作' },
  AUTHZ_ROLE_REQUIRED:  { code: 'AUTHZ_ROLE_REQUIRED',  http: 403, message: '需要更高权限' },

  // 校验
  VAL_REQUIRED:         { code: 'VAL_REQUIRED',         http: 400, message: '必填字段缺失' },
  VAL_INVALID:          { code: 'VAL_INVALID',          http: 400, message: '字段值不合法' },
  VAL_TYPE_MISMATCH:    { code: 'VAL_TYPE_MISMATCH',    http: 400, message: '字段类型不匹配' },

  // 排班
  SCH_NOT_FOUND:        { code: 'SCH_NOT_FOUND',        http: 404, message: '排班不存在' },
  SCH_CONFLICT:         { code: 'SCH_CONFLICT',         http: 409, message: '排班冲突：该诊室该周次该时段已有排班' },
  SCH_DOCTOR_BUSY:      { code: 'SCH_DOCTOR_BUSY',      http: 409, message: '该医生该周次该时段已安排其他诊室' },
  SCH_INVALID_SLOT:     { code: 'SCH_INVALID_SLOT',     http: 400, message: '无效的时段' },

  // 基础数据
  META_CAMPUS_NOT_FOUND: { code: 'META_CAMPUS_NOT_FOUND', http: 404, message: '院区不存在' },
  META_ROOM_NOT_FOUND:   { code: 'META_ROOM_NOT_FOUND',   http: 404, message: '诊室不存在' },
  META_DOCTOR_NOT_FOUND: { code: 'META_DOCTOR_NOT_FOUND', http: 404, message: '医生不存在' },
  META_SLOT_NOT_FOUND:   { code: 'META_SLOT_NOT_FOUND',   http: 404, message: '时段不存在' },
  META_HAS_REFERENCES:   { code: 'META_HAS_REFERENCES',   http: 409, message: '仍被其他数据引用，无法删除' },

  // Excel
  EXC_PARSE_FAILED:     { code: 'EXC_PARSE_FAILED',     http: 400, message: 'Excel 解析失败' },
  EXC_INVALID_HEADERS:  { code: 'EXC_INVALID_HEADERS',  http: 400, message: 'Excel 表头不符合要求' },
  EXC_EMPTY:            { code: 'EXC_EMPTY',            http: 400, message: 'Excel 内容为空' },
  EXC_TOO_LARGE:        { code: 'EXC_TOO_LARGE',        http: 413, message: 'Excel 文件过大' },
  EXC_JOB_NOT_FOUND:    { code: 'EXC_JOB_NOT_FOUND',    http: 404, message: '导入任务不存在' },
  EXC_PARTIAL_FAIL:     { code: 'EXC_PARTIAL_FAIL',     http: 207, message: '部分行导入失败' },

  // 数据库
  DB_ERROR:             { code: 'DB_ERROR',             http: 500, message: '数据库错误' },
  DB_DUPLICATE:         { code: 'DB_DUPLICATE',         http: 409, message: '数据重复' },
  DB_CONSTRAINT:        { code: 'DB_CONSTRAINT',        http: 409, message: '违反数据约束' },

  // 系统
  SYS_INTERNAL:         { code: 'SYS_INTERNAL',         http: 500, message: '服务器内部错误' },
  SYS_NOT_FOUND:        { code: 'SYS_NOT_FOUND',        http: 404, message: '资源不存在' },
  SYS_RATE_LIMITED:     { code: 'SYS_RATE_LIMITED',     http: 429, message: '请求过于频繁' },
  SYS_MAINTENANCE:      { code: 'SYS_MAINTENANCE',      http: 503, message: '系统维护中' }
};

/**
 * 业务异常类：抛出后由 errorHandler 中间件统一处理
 *
 * 用法：
 *   throw new BizError(ERR.SCH_CONFLICT, '该诊室该周次该时段已有排班', { roomId: 101 });
 *   throw new BizError(ERR.VAL_REQUIRED, '缺少医生姓名', { field: 'doctorName' });
 */
class BizError extends Error {
  constructor(errDef, customMessage, details) {
    const def = (errDef && errDef.code) ? errDef : ERR.SYS_INTERNAL;
    super(customMessage || def.message);
    this.name = 'BizError';
    this.code = def.code;
    this.httpStatus = def.http || 500;
    this.details = details;
  }
}

/**
 * 快捷抛出
 */
function biz(errDef, customMessage, details) {
  return new BizError(errDef, customMessage, details);
}

/**
 * 统一响应：成功
 */
function ok(data, extra) {
  const r = { success: true };
  if (data !== undefined) r.data = data;
  if (extra) Object.assign(r, extra);
  return r;
}

/**
 * 统一响应：失败
 */
function fail(errDef, customMessage, details) {
  const def = (errDef && errDef.code) ? errDef : ERR.SYS_INTERNAL;
  const r = { success: false, code: def.code, error: customMessage || def.message };
  if (details) r.details = details;
  return r;
}

/**
 * Express 中间件：捕获并格式化错误
 *
 * 生产环境安全策略：
 *  - 4xx 业务错误：正常返回 details（前端用于错误分类、提示）
 *  - 5xx 系统错误：仅返回固定文案 + 通用 code，原始 err.message 写入日志
 *  - SQL/SQLite 内部错误自动归类为 SYS_INTERNAL，不暴露 schema
 */
function errorMiddleware() {
  const isProd = process.env.NODE_ENV === 'production';
  return function (err, req, res, next) { // eslint-disable-line no-unused-vars
    if (res.headersSent) return next(err);

    if (err instanceof BizError) {
      // 业务异常：5xx 的 BizError 也脱敏 details
      const details = err.httpStatus >= 500 && isProd ? undefined : err.details;
      return res.status(err.httpStatus).json(fail(
        { code: err.code, http: err.httpStatus, message: err.message },
        err.message,
        details
      ));
    }

    // 业务上抛的 { code, message } 形式
    if (err && err.code && typeof err.code === 'string' && ERR[err.code]) {
      const def = ERR[err.code]
      return res.status(def.http).json(fail(def, err.message, err.details));
    }

    // SQLite 唯一约束
    if (err && /UNIQUE constraint failed/i.test(err.message || '')) {
      return res.status(409).json(fail(ERR.DB_DUPLICATE, '数据重复：违反唯一性约束'));
    }

    // 其它未处理：5xx 必须脱敏
    const httpStatus = err.status || err.statusCode || 500;
    if (httpStatus >= 500) {
      // 完整错误日志：req.id 已由 requestId 中间件绑定
      log.error('unhandled.error', {
        url: req.originalUrl,
        method: req.method,
        requestId: req.id
      }, err);
      if (isProd) {
        // 生产环境：固定文案，避免 SQL/stack 泄露
        return res.status(httpStatus).json({
          success: false,
          code: 'SYS_INTERNAL',
          error: '服务器内部错误，请稍后重试',
          requestId: req.id
        });
      }
      return res.status(httpStatus).json({
        success: false,
        code: 'SYS_INTERNAL',
        error: err.message || 'Server Error',
        requestId: req.id
      });
    }

    // 4xx 非业务错误（如 404）
    return res.status(httpStatus).json({
      success: false,
      code: 'SYS_NOT_FOUND',
      error: isProd ? '资源不存在' : (err.message || 'Not Found')
    });
  };
}

/**
 * asyncHandler 包装：捕获 async 路由中的 reject 并传给 next
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  ERR,
  BizError,
  biz,
  ok,
  fail,
  errorMiddleware,
  asyncHandler
};
