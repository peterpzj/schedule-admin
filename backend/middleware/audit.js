/**
 * 记录操作日志
 */
const { getDb } = require('../db');

function audit(userId, username, action, entity, entityId, details, ip) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, username, action, entity, String(entityId || ''), JSON.stringify(details || {}), ip || '');
  } catch (e) {
    console.error('audit log failed:', e);
  }
}

module.exports = { audit };
