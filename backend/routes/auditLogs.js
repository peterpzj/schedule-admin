/**
 * 审计日志查询路由（只读）
 *   GET /api/auditLogs             列表（分页 + 过滤，仅 admin）
 *   GET /api/auditLogs/:id         详情
 *   GET /api/auditLogs/stats/summary  按 action 聚合
 *
 * #6 修复：所有 admin-only 路由统一挂 requireRole(PERMISSIONS.ADMIN_SYSTEM)
 *          替代散落的 `req.user.role !== 'admin'` 内联检查
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { PERMISSIONS } = require('../lib/roles');

function parseDetails(details) {
  if (!details) return null;
  try { return JSON.parse(details); } catch (_) { return details; }
}

function rowToApi(r) {
  if (!r) return null;
  return {
    _id: r.id,
    userId: r.user_id,
    username: r.username,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    details: parseDetails(r.details),
    ip: r.ip,
    createdAt: r.created_at
  };
}

// 列表：分页 + 过滤（仅 admin）
router.get('/', requireAuth, requireRole(PERMISSIONS.ADMIN_SYSTEM), (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, parseInt(req.query.pageSize, 10) || 50);
  const offset = (page - 1) * pageSize;

  let where = '1=1';
  const params = [];
  if (req.query.userId)   { where += ' AND user_id = ?';   params.push(Number(req.query.userId)); }
  if (req.query.username) { where += ' AND username = ?'; params.push(String(req.query.username)); }
  if (req.query.action)   { where += ' AND action = ?';   params.push(String(req.query.action)); }
  if (req.query.entity)   { where += ' AND entity = ?';   params.push(String(req.query.entity)); }
  if (req.query.from)     { where += ' AND created_at >= ?'; params.push(String(req.query.from)); }
  if (req.query.to)       { where += ' AND created_at <= ?'; params.push(String(req.query.to)); }

  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS c FROM audit_logs WHERE ' + where).get(...params).c;
  const rows = db.prepare(
    'SELECT * FROM audit_logs WHERE ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?'
  ).all(...params, pageSize, offset);

  res.json({ success: true, data: rows.map(rowToApi), total, page, pageSize });
});

// 详情（仅 admin）
router.get('/:id', requireAuth, requireRole(PERMISSIONS.ADMIN_SYSTEM), (req, res) => {
  const row = getDb().prepare('SELECT * FROM audit_logs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: '记录不存在' });
  res.json({ success: true, data: rowToApi(row) });
});

// 聚合：按 action 统计（仅 admin）
router.get('/stats/summary', requireAuth, requireRole(PERMISSIONS.ADMIN_SYSTEM), (req, res) => {
  const db = getDb();
  const since = String(req.query.since || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19));
  const byAction = db.prepare(
    'SELECT action, COUNT(*) AS count FROM audit_logs WHERE created_at >= ? GROUP BY action ORDER BY count DESC'
  ).all(since);
  const byEntity = db.prepare(
    'SELECT entity, COUNT(*) AS count FROM audit_logs WHERE created_at >= ? GROUP BY entity ORDER BY count DESC'
  ).all(since);
  res.json({ success: true, since, byAction, byEntity });
});

// #P0-4 修复：hash 链校验端点（仅 admin）
//   配套 lib/auditVerify.js；前端可调用此端点做"防篡改"状态检查
//   - ok=true  → 链完整
//   - ok=false → 链断裂（brokenAt / expected / got 都有）
router.get('/verify/chain', requireAuth, requireRole(PERMISSIONS.ADMIN_SYSTEM), (req, res) => {
  const { verifyWithStats } = require('../lib/auditVerify');
  const stats = verifyWithStats();
  res.json({ success: true, data: stats });
});

module.exports = router;