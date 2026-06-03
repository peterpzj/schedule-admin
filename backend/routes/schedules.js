/**
 * 排班路由（v2 - 周模板）
 * 注意：字段命名用下划线（数据库风格），与小程序 API 的驼峰命名不同
 * 在 db/index.js 的查询里我们做 AS 映射
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

/**
 * 把数据库行（snake_case）映射为 API 行（camelCase）
 */
function toApi(row) {
  if (!row) return null;
  return {
    _id: row.id,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    workId: row.work_id,
    department: row.department,
    campusCode: row.campus_code,
    campus: row.campus_name,
    zoneCode: row.zone_code,
    zoneName: row.zone_name,
    roomId: row.room_id,
    roomName: row.room_name,
    clinicTypeCode: row.clinic_type_code,
    clinicTypeName: row.clinic_type_name,
    timeSlotId: row.time_slot_id,
    timeSlotCode: row.time_slot_code,
    period: row.period,
    startTime: row.start_time,
    endTime: row.end_time,
    dayOfWeek: row.day_of_week,
    remark: row.remark,
    patientLimit: row.patient_limit,
    createTime: row.created_at,
    updateTime: row.updated_at
  };
}

/**
 * 列表
 * GET /api/schedules?dayOfWeek=1&campusCode=YX&doctorName=张
 */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  let where = '1=1';
  const params = [];
  if (req.query.campusCode) { where += ' AND campus_code = ?'; params.push(req.query.campusCode); }
  if (req.query.zoneCode) { where += ' AND zone_code = ?'; params.push(req.query.zoneCode); }
  if (req.query.clinicTypeCode) { where += ' AND clinic_type_code = ?'; params.push(req.query.clinicTypeCode); }
  if (req.query.dayOfWeek) { where += ' AND day_of_week = ?'; params.push(Number(req.query.dayOfWeek)); }
  if (req.query.doctorId) { where += ' AND doctor_id = ?'; params.push(req.query.doctorId); }
  if (req.query.doctorName) { where += ' AND doctor_name LIKE ?'; params.push('%' + req.query.doctorName + '%'); }
  if (req.query.roomId) { where += ' AND room_id = ?'; params.push(req.query.roomId); }
  if (req.query.department) { where += ' AND department = ?'; params.push(req.query.department); }
  if (req.query.period) { where += ' AND period = ?'; params.push(req.query.period); }

  const rows = db.prepare('SELECT * FROM schedules WHERE ' + where + ' ORDER BY day_of_week, period, room_id').all(...params);
  res.json({ success: true, data: rows.map(toApi) });
});

/**
 * 详情
 */
router.get('/:id', requireAuth, (req, res) => {
  const row = getDb().prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: '记录不存在' });
  res.json({ success: true, data: toApi(row) });
});

/**
 * 新增（含冲突检查）
 */
router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  const required = ['doctor_id', 'doctor_name', 'campus_code', 'room_id', 'day_of_week', 'time_slot_code'];
  for (const f of required) {
    if (b[f] === undefined) return res.status(400).json({ success: false, error: '缺少字段：' + f });
  }
  const db = getDb();
  // 冲突检查（含 campusCode）
  const conflict = db.prepare(
    'SELECT id FROM schedules WHERE campus_code = ? AND room_id = ? AND day_of_week = ? AND time_slot_code = ?'
  ).get(b.campus_code, b.room_id, Number(b.day_of_week), b.time_slot_code);
  if (conflict) return res.status(400).json({ success: false, error: '该诊室该周次该时段已有排班' });

  // 医生冲突
  const docConflict = db.prepare(
    'SELECT id FROM schedules WHERE doctor_id = ? AND day_of_week = ? AND time_slot_code = ?'
  ).get(b.doctor_id, Number(b.day_of_week), b.time_slot_code);
  if (docConflict) return res.status(400).json({ success: false, error: '该医生该周次该时段已安排其他诊室' });

  const fields = ['doctor_id', 'doctor_name', 'work_id', 'department', 'campus_code', 'campus_name', 'zone_code', 'zone_name', 'room_id', 'room_name', 'clinic_type_code', 'clinic_type_name', 'time_slot_id', 'time_slot_code', 'period', 'start_time', 'end_time', 'day_of_week', 'remark', 'patient_limit'];
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => b[f] ?? null);
  values[fields.indexOf('day_of_week')] = Number(b.day_of_week);
  try {
    const info = db.prepare('INSERT INTO schedules (' + fields.join(',') + ') VALUES (' + placeholders + ')').run(...values);
    audit(req.user.id, req.user.username, 'create', 'schedules', info.lastInsertRowid, b, req.ip);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

/**
 * 修改
 */
router.put('/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const fields = ['doctor_id', 'doctor_name', 'work_id', 'department', 'campus_code', 'campus_name', 'zone_code', 'zone_name', 'room_id', 'room_name', 'clinic_type_code', 'clinic_type_name', 'time_slot_id', 'time_slot_code', 'period', 'start_time', 'end_time', 'day_of_week', 'remark', 'patient_limit'];
  const sets = fields.map(f => f + ' = ?').join(',');
  const values = fields.map(f => b[f] ?? null);
  values.push(req.params.id);
  if (b.day_of_week) values[fields.indexOf('day_of_week')] = Number(b.day_of_week);
  try {
    const info = getDb().prepare('UPDATE schedules SET ' + sets + ', updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(...values);
    audit(req.user.id, req.user.username, 'update', 'schedules', req.params.id, b, req.ip);
    res.json({ success: true, updated: info.changes });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

/**
 * 删除
 */
router.delete('/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: '无权限' });
  const info = getDb().prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  audit(req.user.id, req.user.username, 'delete', 'schedules', req.params.id, null, req.ip);
  res.json({ success: true, deleted: info.changes });
});

/**
 * 批量导入（小程序 batchAddSchedules 的服务端版本）
 * POST /api/schedules/batch
 * Body: { list: [...] }
 */
router.post('/batch', requireAuth, (req, res) => {
  const { list } = req.body || {};
  if (!Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ success: false, error: 'list 必须是数组' });
  }
  if (list.length > 100) {
    return res.status(400).json({ success: false, error: '单次最多 100 条' });
  }
  const db = getDb();
  let inserted = 0;
  const conflicts = [];
  const insertOne = db.prepare(`
    INSERT INTO schedules (
      doctor_id, doctor_name, work_id, department,
      campus_code, campus_name, zone_code, zone_name,
      room_id, room_name,
      clinic_type_code, clinic_type_name,
      time_slot_id, time_slot_code, period, start_time, end_time,
      day_of_week, remark, patient_limit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((rows) => {
    for (let i = 0; i < rows.length; i++) {
      const b = rows[i];
      if (!b.doctor_id || !b.room_id || !b.day_of_week || !b.time_slot_code) {
        throw new Error('第 ' + (i + 1) + ' 条：缺少必填');
      }
      const c = db.prepare(
        'SELECT id FROM schedules WHERE campus_code = ? AND room_id = ? AND day_of_week = ? AND time_slot_code = ?'
      ).get(b.campus_code, b.room_id, Number(b.day_of_week), b.time_slot_code);
      if (c) {
        conflicts.push(b.room_id + ' ' + b.time_slot_code);
        continue;
      }
      insertOne.run(
        b.doctor_id, b.doctor_name, b.work_id || '', b.department || '',
        b.campus_code, b.campus_name || '', b.zone_code || '', b.zone_name || '',
        b.room_id, b.room_name || '',
        b.clinic_type_code || '', b.clinic_type_name || '',
        b.time_slot_id || null, b.time_slot_code, b.period || '', b.start_time || '', b.end_time || '',
        Number(b.day_of_week), b.remark || '', b.patient_limit || null
      );
      inserted++;
    }
  });
  try {
    tx(list);
    audit(req.user.id, req.user.username, 'batch_create', 'schedules', null, { count: inserted, conflicts }, req.ip);
    if (conflicts.length > 0) {
      return res.json({ success: false, error: '部分冲突：' + conflicts.slice(0, 5).join(', '), conflicts });
    }
    res.json({ success: true, inserted });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;
