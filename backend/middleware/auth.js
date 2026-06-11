/**
 * JWT 鉴权中间件
 *
 * JWT_SECRET 校验逻辑委托给 ./secret（纯函数，便于单测）
 *   - 未设置 / 仍是默认占位 / 长度不足 -> 进程退出
 *   - 一旦校验通过，整次进程内复用，不重复检查
 *
 * 密钥轮换：
 *   签发用 current（带 kv=1），验签允许 current（kv=1）+ previous（kv=0）
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  resolveSecret: _resolveSecret,
  isSecretValid,
  validateSecret,
  fatalIfInvalid,
  getCurrentSecret,
  getCurrentKv,
  getPreviousSecret,
  pickSecretForVerify
} = require('./secret');
const { ERR, biz } = require('../lib/errors');
const log = require('../lib/logger');
// #P0-2 修复：token 黑名单改为 lib/store.js 抽象层
//   - 默认 memory：进程内 Map，自动 GC
//   - 可切 sqlite：跨进程/重启保留
//   - 留出 Redis 钩子（store.createStore({ backend: 'redis', ... })）
const { getStore } = require('../lib/store');

const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BLACKLIST_KEY = (jti) => 'jwt:blacklist:' + jti

function blacklistToken(jti, expSec) {
  if (!jti) return;
  const expMs = (expSec || 0) * 1000 || Date.now() + 7 * 24 * 60 * 60 * 1000;
  const ttl = Math.max(1000, expMs - Date.now());
  // 存 true，TTL 到期自动清（store 会自动 GC）
  getStore().set(BLACKLIST_KEY(jti), true, ttl);
}

function isBlacklisted(jti) {
  if (!jti) return false;
  // #P0-2 修复：黑名单查询走 lib/store
  //   store.get() 内部已自动跳过过期 key，无需手动 delete
  return getStore().has(BLACKLIST_KEY(jti));
}

/**
 * 签发 token：payload 注入 kv + jti 字段
 *   - kv  便于轮换期验签选 key
 *   - jti 用于服务端登出时拉黑单条 token
 *   - exp 计算为 now + TOKEN_EXPIRES_IN，避免对同一 payload 二次 jwt.sign 取 exp
 */
function signToken(payload) {
  const jti = crypto.randomBytes(16).toString('hex');
  // #P0-7 修复：注入 type='access'，与 refresh token 的 type='refresh' 协议层隔离
  // 之前只靠密钥物理隔离：access secret 一泄露 + 有 verifyBoth 路径就会出事
  const enriched = Object.assign({}, payload, { kv: getCurrentKv(), jti, type: 'access' });
  const token = jwt.sign(enriched, getCurrentSecret(), { expiresIn: TOKEN_EXPIRES_IN });
  const expSec = Math.floor(Date.now() / 1000) + parseExpiresIn(TOKEN_EXPIRES_IN);
  return { token, jti, exp: expSec };
}

/**
 * signRefreshToken / verifyRefreshToken — 独立的 refresh token（14d）
 * 用与 access token 不同的 secret（JWT_REFRESH_SECRET），避免一处泄露两边都丢
 *
 * 安全要求：JWT_REFRESH_SECRET 必须显式配置（≥32 字符，且不等于 JWT_SECRET_CURRENT）。
 * 之前的 fallback `getCurrentSecret() + '.refresh'` 派生密钥不安全：
 *   - 字符串拼接不构成密码学独立，access secret 一泄露 refresh secret 立即可推导
 *   - 静默启动意味着发布时漏配 JWT_REFRESH_SECRET 不会被发现
 * 修复：缺配或弱配时启动期 exit(78)，参考 secret.js 的同款强校验。
 */
function resolveRefreshSecret() {
  const v = process.env.JWT_REFRESH_SECRET
  if (!v || typeof v !== 'string') {
    console.error('')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('[auth.js] 启动失败：缺少 JWT_REFRESH_SECRET')
    console.error('  refresh token 必须使用与 access 不同的密钥')
    console.error('  请在 .env 中配置：')
    console.error('    JWT_REFRESH_SECRET=<openssl rand -base64 48>')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('')
    process.exit(78)
  }
  if (v.length < 32) {
    console.error('[auth.js] JWT_REFRESH_SECRET 长度不足 32 字符，拒绝启动')
    process.exit(78)
  }
  // 不允许与 access secret 完全相同
  const accessSecret = getCurrentSecret()
  if (v === accessSecret) {
    console.error('[auth.js] JWT_REFRESH_SECRET 与 JWT_SECRET_CURRENT 相同，必须独立')
    process.exit(78)
  }
  return v
}

const REFRESH_SECRET = resolveRefreshSecret()
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '14d'

function signRefreshToken(payload) {
  const jti = crypto.randomBytes(16).toString('hex');
  const enriched = Object.assign({}, payload, { type: 'refresh', kv: getCurrentKv(), jti });
  return jwt.sign(enriched, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN })
}

function verifyRefreshToken(token) {
  let decoded
  try { decoded = jwt.verify(token, REFRESH_SECRET) } catch (_) { return null }
  if (!decoded || decoded.type !== 'refresh') return null
  if (isBlacklisted(decoded.jti)) return null
  return { userId: decoded.userId, jti: decoded.jti, exp: decoded.exp }
}

/**
 * 把 '7d' / '24h' / '60m' / '60s' 解析成秒数
 * 与 jsonwebtoken 的 expiresIn 单位一致
 */
function parseExpiresIn(s) {
  if (typeof s === 'number') return s
  if (typeof s !== 'string') return 0
  const m = /^(\d+)\s*([smhd])?$/.exec(s.trim())
  if (!m) return 0
  const n = parseInt(m[1], 10)
  const u = m[2] || 's'
  return n * (u === 'd' ? 86400 : u === 'h' ? 3600 : u === 'm' ? 60 : 1)
}

/**
 * 验签：按 payload.kv 选 current/previous；任何不匹配返回 null
 */
function verifyToken(token) {
  // 先不带密钥解一次，只读 header/payload，再用对应 secret 验签
  let decoded;
  try {
    decoded = jwt.decode(token);
  } catch (_) {
    return null;
  }
  if (!decoded) return null;
  // #P0-7 修复：verifyToken 显式拒绝 type='refresh'，防止协议层混淆
  // 之前 signToken 不注入 type，verifyToken 也不校验，依赖密钥物理隔离
  if (decoded.type && decoded.type !== 'access') return null;
  if (isBlacklisted(decoded.jti)) return null;
  const secret = pickSecretForVerify(decoded);
  if (!secret) return null;
  try {
    return jwt.verify(token, secret);
  } catch (e) {
    return null;
  }
}

// 带进程退出副作用的 resolveSecret（保持向后兼容 server.js / middleware 调用方）
function resolveSecret() {
  try {
    return _resolveSecret();
  } catch (e) {
    log.error('jwt.secret.invalid', { detail: e.detail || {} }, e);
    // 启动期失败：在 stderr 打印醒目面板 + 退出码 78 (EX_CONFIG)
    fatalIfInvalid(process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET, 'JWT_SECRET_CURRENT');
    process.exit(78);
  }
}

/**
 * Express 中间件：要求请求携带有效 token
 */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return next(biz(ERR.AUTH_TOKEN_MISSING, '未登录'));
  const payload = verifyToken(token);
  if (!payload) return next(biz(ERR.AUTH_TOKEN_INVALID, 'Token 无效或已过期'));
  req.user = payload;
  next();
}

/**
 * 从 Authorization 头解析用户（不强制要求）
 */
function tryGetUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

module.exports = {
  signToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyToken,
  requireAuth,
  tryGetUser,
  blacklistToken,
  isBlacklisted,
  // #P0-2 修复：暴露 store 接口供运维/测试
  getStore,
  isSecretValid,
  resolveSecret,
  validateSecret
};
