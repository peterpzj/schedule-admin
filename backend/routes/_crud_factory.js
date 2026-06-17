/**
 * 通用 CRUD 工厂
 * 大部分表结构相似，复用一份 CRUD 逻辑
 */
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { audit } = require('../middleware/audit');
const { ERR, biz, ok } = require('../lib/errors');
const { PERMISSIONS } = require('../lib/roles');

/**
 * 删除引用关系表：table → [{ refTable, refColumn, lookupColumn }]
 *   - lookupColumn 是被删记录里用来比对引用表的列（默认 'code'，doctors 用 'id'）
 *   - schedules 没有直接 FK，但 room_id/time_slot_code/campus_code/doctor_id 都是语义引用
 *     所以只要被删的表是 rooms/zones/campuses/doctors/time_slots/clinic_types，
 *     都要去 schedules 查引用
 *
 * 注：故意不查 doctors.time_slot_code / rooms.time_slot_code 这种复合外键，
 *     schedules 表里 room_id / time_slot_code 是文本字段、不是 FK，无法在 ON DELETE CASCADE 里联动。
 *     真正安全的做法是事务里先 SELECT count + DELETE 一起做。
 */
// #P1-13 修复：补全跨表级联引用检查
//   - 任何时候先查"直接子表"再查"孙表"（zones → schedules + rooms；campuses → schedules + time_slots；departments → doctors）
const REFERENCE_CHECKS = {
  campuses: [
    { refTable: 'schedules',   refColumn: 'campus_code' },
    { refTable: 'time_slots',  refColumn: 'campus_code' }
  ],
  zones: [
    { refTable: 'schedules',   refColumn: 'zone_code' },
    { refTable: 'rooms',       refColumn: 'zone_code' }
  ],
  rooms: [
    { refTable: 'schedules',   refColumn: 'room_id' }
  ],
  doctors: [
    { refTable: 'schedules',   refColumn: 'doctor_id' }
  ],
  time_slots: [
    { refTable: 'schedules',   refColumn: 'time_slot_code' }
  ],
  clinic_types: [
    { refTable: 'time_slots',  refColumn: 'clinic_type_code' }
  ],
  // departments 是医生表的逻辑父表（doctors.department = departments.name）
  departments: [
    { refTable: 'doctors',     refColumn: 'department' }
  ]
};

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

    res.json(ok({ data: list, total, page, pageSize }));
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
      // 有 allowedFields 配置时，只插入白名单内的字段（忽略 body 其他字段）
      const fields = allowedFields;
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
      return;
    }
    // 无 allowedFields 配置时拒绝写入（防止意外全字段可写）
    res.status(400).json({ success: false, error: '该接口未配置可写字段，禁止写入' });
  });

  // 修改
  router.put('/:id', requireAuth, (req, res) => {
    // #B4 修复：minip 传来字符串 id（work_id/code 等），与整数主键 id 列不匹配
    //   短期止血：按 lookupCol 查回整数 id
    if (req.params.id && !/^\d+$/.test(req.params.id)) {
      const lookupCol = table === 'doctors' ? 'work_id' : 'code';
      const row = getDb().prepare('SELECT id FROM ' + table + ' WHERE ' + lookupCol + ' = ?').get(req.params.id);
      if (row) req.params.id = row.id;
      else return res.status(404).json({ success: false, code: 'NOT_FOUND', error: '记录不存在' });
    }
    const body = req.body || {};
    if (allowedFields.length > 0) {
      const fields = allowedFields;
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
      return;
    }
    res.status(400).json({ success: false, error: '该接口未配置可写字段，禁止写入' });
  });

  // 删除（仅 admin）
  router.delete('/:id', requireAuth, requireRole(PERMISSIONS.ADMIN_SYSTEM), (req, res) => {
    // #B4 修复：minip 传来字符串 id（work_id/code 等），与整数主键 id 列不匹配
    //   短期止血：按 lookupCol 查回整数 id
    if (req.params.id && !/^\d+$/.test(req.params.id)) {
      const lookupCol = table === 'doctors' ? 'work_id' : 'code';
      const row = getDb().prepare('SELECT id FROM ' + table + ' WHERE ' + lookupCol + ' = ?').get(req.params.id);
      if (row) req.params.id = row.id;
      else return res.status(404).json({ success: false, code: 'NOT_FOUND', error: '记录不存在' });
    }
    const db = getDb();
    try {
      // 1) 取被删记录的 lookup 字段（用 code；doctors 用 id 已在 lookupColumn 体现）
      const row = db.prepare('SELECT * FROM ' + table + ' WHERE id = ?').get(req.params.id);
      if (!row) return res.status(404).json({ success: false, error: '记录不存在' });

      // 2) 查引用：表里配置的每条规则 count > 0 就报错
      const refs = REFERENCE_CHECKS[table] || [];
      for (const ref of refs) {
        const lookupValue = row.code != null ? row.code : row.id;
        const count = db.prepare(
          'SELECT COUNT(*) AS c FROM ' + ref.refTable + ' WHERE ' + ref.refColumn + ' = ?'
        ).get(lookupValue).c;
        if (count > 0) {
          return res.status(409).json({
            success: false,
            code: ERR.META_HAS_REFERENCES.code,
            error: ERR.META_HAS_REFERENCES.message,
            details: { refTable: ref.refTable, refColumn: ref.refColumn, refCount: count }
          });
        }
      }

      // 3) 真删
      const info = db.prepare('DELETE FROM ' + table + ' WHERE id = ?').run(req.params.id);
      audit(req.user.id, req.user.username, 'delete', entity, req.params.id, null, req.ip);
      res.json({ success: true, deleted: info.changes });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  return router;
}

module.exports = { createCrudRouter };
