/**
 * 登录 / 鉴权路由
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDb } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { loginLimiter, createUserLimiter } = require('../middleware/rateLimit');
const { audit } = require('../middleware/audit');
const { ERR, biz, ok, asyncHandler } = require('../lib/errors');
const { ROLES, isValidRole, normalizeRole, PERMISSIONS } = require('../lib/roles');

// #28 + #P0-1 修复：账号级失败计数
//   - 之前是进程内 Map，重启即清零 → 攻击者可借重启窗口绕过
//   - 现在走 lib/store.js 抽象层；默认 memory，可切 sqlite（STORE_BACKEND=sqlite）
//   - 防 bucket poisoning 规则保持：无效 username 不计数（见下方 controller）
const { getStore } = require('../lib/store')
const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000
const LOGIN_FAIL_LIMIT = 10

function loginFailKey(username) { return 'loginFail:' + username.toLowerCase().trim() }

function getLoginFailCount(username) {
  if (!username) return 0
  const e = getStore().get(loginFailKey(username))
  if (!e) return 0
  return e.value.count || 0
}
function bumpLoginFailCount(username) {
  if (!username) return
  const key = loginFailKey(username)
  const e = getStore().get(key)
  const now = Date.now()
  const cur = (e && e.value) || { count: 0, resetAt: now + LOGIN_FAIL_WINDOW_MS }
  // 第一次 / 过期 → 重置窗口
  if (!e || cur.resetAt <= now) {
    cur.count = 1
    cur.resetAt = now + LOGIN_FAIL_WINDOW_MS
  } else {
    cur.count++
  }
  getStore().set(key, cur, LOGIN_FAIL_WINDOW_MS)
}
function clearLoginFailCount(username) {
  if (username) getStore().del(loginFailKey(username))
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    throw biz(ERR.VAL_REQUIRED, '请提供账号和密码');
  }
  const db = getDb();
  // #28 修复：账号级限流放在 controller 内手动维护，避免 bucket poisoning
  // 规则：
  //   - username 不存在 → 直接返回 AUTH_LOGIN_FAILED，不创建 bucket
  //   - username 存在但 password 错 → 给该 username 加 1 次失败计数
  //   - 同一 username 15 分钟内累计 10 次失败 → 锁定（直到 15 分钟后再试）
  //   - 登录成功 → 清空该 username 的失败桶
  const normalizedUser = String(username).toLowerCase().trim();
  const failCount = getLoginFailCount(normalizedUser);
  if (failCount >= 10) {
    throw biz(ERR.SYS_RATE_LIMITED, '该账号登录失败次数过多，请 15 分钟后再试');
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.status !== 'active') {
    // 无效 username：不计数（防 poisoning），直接返回模糊错误
    throw biz(ERR.AUTH_LOGIN_FAILED, '账号或密码错误');
  }
  const passOk = await bcrypt.compare(password, user.password_hash);
  if (!passOk) {
    bumpLoginFailCount(normalizedUser);
    throw biz(ERR.AUTH_LOGIN_FAILED, '账号或密码错误');
  }
  // 登录成功：清空失败计数
  clearLoginFailCount(normalizedUser);
  // 更新最后登录时间
  db.prepare(`UPDATE users SET last_login_at = datetime('now', 'localtime') WHERE id = ?`).run(user.id);
  audit(user.id, user.username, 'login', 'users', user.id, null, req.ip);

  // 登录时把 role 规范化（防御旧数据 / 手工改 DB 的情况）
  const safeRole = normalizeRole(user.role);
  if (safeRole !== user.role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(safeRole, user.id);
    user.role = safeRole;
  }
  const { token, jti, exp } = signToken({ id: user.id, username: user.username, role: safeRole, name: user.name });
  const { signRefreshToken } = require('../middleware/auth')
  const refreshToken = signRefreshToken({ userId: user.id, jti })
  res.json(ok({
    token,
    jti,        // access token 的 jti，登出时提交
    exp,        // access token 过期时间（秒）
    refreshToken, // 用于 /api/auth/refresh 续期（14d）
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: safeRole
    }
  }));
}));

/**
 * POST /api/auth/logout
 * 把当前 token 的 jti 拉黑，使该 token 即时失效（无需等 7 天）
 */
router.post('/logout', requireAuth, asyncHandler((req, res) => {
  const { jti, exp } = req.user || {};
  if (jti) {
    const { blacklistToken } = require('../middleware/auth');
    blacklistToken(jti, exp);
  }
  audit(req.user.id, req.user.username, 'logout', 'users', req.user.id, { jti: jti || null }, req.ip);
  res.json(ok({ blacklisted: !!jti }));
}));

/**
 * POST /api/auth/refresh
 * Body: { refreshToken: string }  (refreshToken 是一次性 secret，签发时返回)
 *
 * 校验 refresh token → 签发新 access + refresh
 * 旧的 refresh token 立即失效（rotation）
 *
 * 设计要点：
 *   - access token 过期 2h（短）
 *   - refresh token 过期 14d（长）
 *   - 每次 refresh 都换新的 refreshToken；旧 refreshToken 进黑名单
 *   - 即便 accessToken 被偷，14d 内用 refreshToken 续期需要原 refreshToken（设备绑定）
 *
 * 安全：之前版本兼容 "Authorization: Bearer <accessToken>" 走 refresh 路径，
 * 但 verifyToken 不校验 type='refresh'，导致攻击者拿到 access token 就能
 * 升级为可续期的 refresh token（token theft escalation）。
 * 修复：删掉 bearerToken 分支，refresh 只接受 refreshToken 字段。
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const bodyRefresh = req.body && req.body.refreshToken
  if (!bodyRefresh || typeof bodyRefresh !== 'string') {
    throw biz(ERR.AUTH_TOKEN_MISSING, '缺少 refresh token')
  }

  const { verifyRefreshToken, signRefreshToken } = require('../middleware/auth')
  const r = verifyRefreshToken(bodyRefresh)
  if (!r) throw biz(ERR.AUTH_TOKEN_INVALID, 'refresh token 无效或已过期')
  const userId = r.userId
  const oldJti = r.jti

  const db = getDb()
  const user = db.prepare('SELECT id, username, name, role, status FROM users WHERE id = ?').get(userId)
  if (!user || user.status !== 'active') {
    throw biz(ERR.AUTH_USER_DISABLED, '账号不存在或已停用')
  }
  // 把旧的 refresh jti 拉黑（rotation）
  if (oldJti) {
    const { blacklistToken } = require('../middleware/auth')
    blacklistToken(oldJti, Math.floor(Date.now() / 1000) + 14 * 24 * 3600)
  }
  const { token, jti, exp } = signToken({
    id: user.id, username: user.username, role: user.role, name: user.name
  })
  const refreshToken = signRefreshToken({ userId: user.id, jti })
  audit(user.id, user.username, 'refresh', 'users', user.id, null, req.ip)
  res.json(ok({
    token,
    jti,
    exp,
    refreshToken,
    user: {
      id: user.id, username: user.username, name: user.name, role: user.role
    }
  }))
}));

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, asyncHandler((req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, name, role, created_at, last_login_at FROM users WHERE id = ?').get(req.user.id);
  res.json(ok({ user }));
}));

/**
 * POST /api/auth/change-password
 * Body: { oldPassword, newPassword }
 */
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    throw biz(ERR.VAL_INVALID, '新密码至少 6 位');
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const passOk = await bcrypt.compare(oldPassword, user.password_hash);
  if (!passOk) throw biz(ERR.AUTH_LOGIN_FAILED, '原密码错误');
  // #P1-1 修复：bcrypt cost 10 → 12
  const newHash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  audit(user.id, user.username, 'change_password', 'users', user.id, null, req.ip);
  res.json(ok({ message: '密码已修改' }));
}));

/**
 * GET /api/auth/users（管理员：列出所有账号）
 */
router.get('/users', requireAuth, requireRole(PERMISSIONS.ADMIN_SYSTEM), asyncHandler((req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, name, role, status, created_at, last_login_at FROM users ORDER BY id').all();
  res.json(ok({ data: users }));
}));

/**
 * POST /api/auth/users（管理员：新建账号）
 *
 * 权限策略：
 *   - 新建账号默认 role='viewer'，忽略 body.role 字段
 *   - 提权走 PATCH /api/auth/users/:id/role（独立审计入口）
 * 这样 POST /users 和 PATCH /:id/role 语义不重叠，审计日志可分辨
 *   - create_user：username/password/name
 *   - change_role：from/to
 */
router.post('/users', requireAuth, requireRole(PERMISSIONS.ADMIN_SYSTEM), createUserLimiter, asyncHandler(async (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password) throw biz(ERR.VAL_REQUIRED, '账号和密码必填');
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw biz(ERR.DB_DUPLICATE, '账号已存在');
  // #P1-1 修复：bcrypt cost 10 → 12（密码学强度提升 4 倍，单次 < 300ms）
  const hash = await bcrypt.hash(password, 12);
  // 强制 viewer：忽略 body.role 提权请求
  const finalRole = ROLES.VIEWER;
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)
  `).run(username, hash, name || username, finalRole);
  audit(req.user.id, req.user.username, 'create_user', 'users', info.lastInsertRowid, { username, role: finalRole }, req.ip);
  res.json(ok({ id: info.lastInsertRowid, role: finalRole }));
}));

/**
 * PATCH /api/auth/users/:id/role（管理员：变更账号角色）
 * 唯一允许改 role 的入口
 */
router.patch('/users/:id/role', requireAuth, requireRole(PERMISSIONS.ADMIN_SYSTEM), asyncHandler(async (req, res) => {
  const { role } = req.body || {};
  if (!isValidRole(role)) throw biz(ERR.VAL_INVALID, 'role 仅支持 admin / editor / viewer');
  const db = getDb();
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) throw biz(ERR.SYS_NOT_FOUND, '用户不存在');
  // 防降权自杀：不能把自己降级
  if (Number(req.params.id) === req.user.id && role !== ROLES.ADMIN) {
    throw biz(ERR.AUTHZ_FORBIDDEN, '不能降级自己');
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  audit(req.user.id, req.user.username, 'change_role', 'users', req.params.id, { from: target.role, to: role }, req.ip);
  res.json(ok({ id: Number(req.params.id), role }));
}));

module.exports = router;
