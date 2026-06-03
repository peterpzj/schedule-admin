/**
 * 登录 / 鉴权路由
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDb } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '请提供账号和密码' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ success: false, error: '账号不存在或已停用' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ success: false, error: '账号或密码错误' });
  }
  // 更新最后登录时间
  db.prepare(`UPDATE users SET last_login_at = datetime('now', 'localtime') WHERE id = ?`).run(user.id);
  audit(user.id, user.username, 'login', 'users', user.id, null, req.ip);

  const token = signToken({ id: user.id, username: user.username, role: user.role, name: user.name });
  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', requireAuth, (req, res) => {
  audit(req.user.id, req.user.username, 'logout', 'users', req.user.id, null, req.ip);
  res.json({ success: true });
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, name, role, created_at, last_login_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, user });
});

/**
 * POST /api/auth/change-password
 * Body: { oldPassword, newPassword }
 */
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, error: '新密码至少 6 位' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const ok = await bcrypt.compare(oldPassword, user.password_hash);
  if (!ok) return res.status(401).json({ success: false, error: '原密码错误' });
  const newHash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  audit(user.id, user.username, 'change_password', 'users', user.id, null, req.ip);
  res.json({ success: true, message: '密码已修改' });
});

/**
 * GET /api/auth/users（管理员：列出所有账号）
 */
router.get('/users', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '无权限' });
  }
  const db = getDb();
  const users = db.prepare('SELECT id, username, name, role, status, created_at, last_login_at FROM users ORDER BY id').all();
  res.json({ success: true, data: users });
});

/**
 * POST /api/auth/users（管理员：新建账号）
 */
router.post('/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: '无权限' });
  const { username, password, name, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '账号和密码必填' });
  }
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ success: false, error: '账号已存在' });
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)
  `).run(username, hash, name || username, role || 'user');
  audit(req.user.id, req.user.username, 'create_user', 'users', info.lastInsertRowid, { username }, req.ip);
  res.json({ success: true, id: info.lastInsertRowid });
});

module.exports = router;
