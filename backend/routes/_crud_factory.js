/**
 * 通用 CRUD 工厂
 * 大部分表结构相似，复用一份 CRUD 逻辑
 */
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

/**
 * 创建标准 CRUD 路由
 * @param {string} table 表名
 * @param {object} config { searchable: 可搜索字段, sortable: 可排序字段, allowedFields: 新增/修改允许字段 }
 */
function createCrudRouter(table, config = {}) {
  const router = express.Router();
  const { searchable = [], sortable = [], allowedFields = [], entity = table } = config;

  // 列表（带分页 + 搜索 + 排序）
  router.get('/', requireAuth, (req, res) => {
    const db = getDb();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Number(req.query.pageSize) || 50);
    const offset = (page - 1) * pageSize;
    const sortBy = sortable.includes(req.query.sortBy) ? req.query.sortBy : 'id';
    const sortOrder = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';

    let where = '1=1';
    const params = [];
    if (searchable.length > 0 && req.query.q) {
      const conds = searchable.map(f => `${f} LIKE ?`).join(' OR ');
      where += ' AND (' + conds + ')';
      params.push('%' + req.query.q + '%');
    }
    // 自定义过滤（如 campus_code）
    for (const f of sortable) {
      if (req.query[f] !== undefined && req.query[f] !== '') {
        where += ' AND ' + f + ' = ?';
        params.push(req.query[f]);
      }
    }

    const total = db.prepare('SELECT COUNT(*) AS c FROM ' + table + ' WHERE ' + where).get(...params).c;
    const list = db.prepare(
      'SELECT * FROM ' + table + ' WHERE ' + where + ' ORDER BY ' + sortBy + ' ' + sortOrder + ' LIMIT ? OFFSET ?'
    ).all(...params, pageSize, offset);

    res.json({ success: true, data: list, total, page, pageSize });
  });

  // 详情
  router.get('/:id', requireAuth, (req, res) => {
    const row = getDb().prepare('SELECT * FROM ' + table + ' WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: '记录不存在' });
    res.json({ success: true, data: row });
  });

  // 新增
  router.post('/', requireAuth, (req, res) => {
    const body = req.body || {};
    if (allowedFields.length > 0) {
      for (const f of allowedFields) {
        if (body[f] === undefined) {
          return res.status(400).json({ success: false, error: '缺少字段：' + f });
        }
      }
    }
    const fields = allowedFields.length > 0 ? allowedFields : Object.keys(body);
    const placeholders = fields.map(() => '?').join(',');
    const values = fields.map(f => body[f] ?? null);
    try {
      const info = getDb().prepare(
        'INSERT INTO ' + table + ' (' + fields.join(',') + ') VALUES (' + placeholders + ')'
      ).run(...values);
      audit(req.user.id, req.user.username, 'create', entity, info.lastInsertRowid, body, req.ip);
      res.json({ success: true, id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // 修改
  router.put('/:id', requireAuth, (req, res) => {
    const body = req.body || {};
    const fields = allowedFields.length > 0 ? allowedFields : Object.keys(body);
    const sets = fields.map(f => f + ' = ?').join(',');
    const values = fields.map(f => body[f] ?? null);
    values.push(req.params.id);
    try {
      const info = getDb().prepare('UPDATE ' + table + ' SET ' + sets + ' WHERE id = ?').run(...values);
      audit(req.user.id, req.user.username, 'update', entity, req.params.id, body, req.ip);
      res.json({ success: true, updated: info.changes });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // 删除
  router.delete('/:id', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: '无权限' });
    try {
      const info = getDb().prepare('DELETE FROM ' + table + ' WHERE id = ?').run(req.params.id);
      audit(req.user.id, req.user.username, 'delete', entity, req.params.id, null, req.ip);
      res.json({ success: true, deleted: info.changes });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  return router;
}

module.exports = { createCrudRouter };
