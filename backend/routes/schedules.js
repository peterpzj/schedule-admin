/**
 * 排班路由（v2 - 周模板）
 * 注意：字段命名用下划线（数据库风格），与小程序 API 的驼峰命名不同
 * 在 db/index.js 的查询里我们做 AS 映射
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { audit } = require('../middleware/audit');
const { scheduleWriteLimiter } = require('../middleware/rateLimit');
const { ERR, biz, ok, fail, asyncHandler } = require('../lib/errors');
const { ROLES, PERMISSIONS } = require('../lib/roles');
const log = require('../lib/logger');

/**
 * 字段映射：camelCase → snake_case
 * 前端（Vue/小程序）习惯用驼峰；POST/PUT 接受驼峰或下划线
 */
const FIELD_ALIAS = {
  doctorId: 'doctor_id', doctorName: 'doctor_name',
  workId: 'work_id', department: 'department',
  campusCode: 'campus_code', campusName: 'campus_name',
  zoneCode: 'zone_code', zoneName: 'zone_name',
  roomId: 'room_id', roomName: 'room_name',
  clinicTypeCode: 'clinic_type_code', clinicTypeName: 'clinic_type_name',
  timeSlotId: 'time_slot_id', timeSlotCode: 'time_slot_code',
  period: 'period', startTime: 'start_time', endTime: 'end_time',
  dayOfWeek: 'day_of_week', remark: 'remark', patientLimit: 'patient_limit'
};

/**
 * 把入参 body 规范成 snake_case 字段
 * 同时支持 camelCase 与 snake_case 输入
 */
function normalizeBody(body) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    const key = FIELD_ALIAS[k] || k;
    out[key] = v;
  }
  return out;
}

/**
 * 校验 day_of_week 范围（1-7，ISO 周一到周日）
 */
function validateDayOfWeek(d) {
  if (d == null || d === '') return null; // 允许为空（PUT 局部更新场景）
  const n = Number(d);
  if (!Number.isInteger(n) || n < 1 || n > 7) {
    throw biz(ERR.VAL_INVALID, '周次必须为 1-7 的整数（1=周一，7=周日）', { field: 'day_of_week', value: d });
  }
  return n;
}

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
 * 列表（支持分页）
 * GET /api/schedules?dayOfWeek=1&campusCode=YX&doctorName=张&page=1&pageSize=50
 */
router.get('/', requireAuth, asyncHandler((req, res) => {
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

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Number(req.query.pageSize) || 50);
  const offset = (page - 1) * pageSize;
  const total = db.prepare('SELECT COUNT(*) AS c FROM schedules WHERE ' + where).get(...params).c;
  const rows = db.prepare(
    'SELECT * FROM schedules WHERE ' + where + ' ORDER BY day_of_week, period, room_id LIMIT ? OFFSET ?'
  ).all(...params, pageSize, offset);
  res.json(ok({ data: rows.map(toApi), total, page, pageSize }));
}));

/**
 * 新增（含冲突检查）
 */
router.post('/', requireAuth, requireRole(PERMISSIONS.WRITE_BUSINESS), scheduleWriteLimiter, asyncHandler((req, res) => {
  const b = normalizeBody(req.body);
  const required = ['doctor_id', 'doctor_name', 'campus_code', 'room_id', 'day_of_week', 'time_slot_code'];
  for (const f of required) {
    if (b[f] === undefined) throw biz(ERR.VAL_REQUIRED, '缺少字段：' + f, { field: f });
  }
  b.day_of_week = validateDayOfWeek(b.day_of_week);
  const db = getDb();
  // 冲突检查（含 campusCode）
  const conflict = db.prepare(
    'SELECT id FROM schedules WHERE campus_code = ? AND room_id = ? AND day_of_week = ? AND time_slot_code = ?'
  ).get(b.campus_code, b.room_id, b.day_of_week, b.time_slot_code);
  if (conflict) throw biz(ERR.SCH_CONFLICT, '该诊室该周次该时段已有排班', { conflictId: conflict.id });

  // 医生冲突
  const docConflict = db.prepare(
    'SELECT id FROM schedules WHERE doctor_id = ? AND day_of_week = ? AND time_slot_code = ?'
  ).get(b.doctor_id, b.day_of_week, b.time_slot_code);
  if (docConflict) throw biz(ERR.SCH_DOCTOR_BUSY, '该医生该周次该时段已安排其他诊室', { conflictId: docConflict.id });

  const fields = ['doctor_id', 'doctor_name', 'work_id', 'department', 'campus_code', 'campus_name', 'zone_code', 'zone_name', 'room_id', 'room_name', 'clinic_type_code', 'clinic_type_name', 'time_slot_id', 'time_slot_code', 'period', 'start_time', 'end_time', 'day_of_week', 'remark', 'patient_limit'];
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => b[f] ?? null);
  const info = db.prepare('INSERT INTO schedules (' + fields.join(',') + ') VALUES (' + placeholders + ')').run(...values);
  audit(req.user.id, req.user.username, 'create', 'schedules', info.lastInsertRowid, b, req.ip);
  res.json(ok({ id: info.lastInsertRowid }));
}));

/**
 * 修改（含冲突检查 + 事务化防并发）
 */
router.put('/:id', requireAuth, requireRole(PERMISSIONS.WRITE_BUSINESS), scheduleWriteLimiter, asyncHandler((req, res) => {
  const b = normalizeBody(req.body);
  if (b.day_of_week !== undefined) {
    b.day_of_week = validateDayOfWeek(b.day_of_week);
  }
  const db = getDb();
  const id = Number(req.params.id);

  // 把"冲突检查 + UPDATE"放进一个 IMMEDIATE 事务
  // better-sqlite3 的 transaction() 在同步代码里默认就是原子执行
  // 避免两个并发请求都通过 SELECT 冲突检查、然后都 UPDATE
  const updateRow = db.transaction((sid) => {
    const existing = db.prepare('SELECT * FROM schedules WHERE id = ?').get(sid);
    if (!existing) {
      const err = new Error('排班不存在');
      err.code = 'SCH_NOT_FOUND';
      err.httpStatus = 404;
      throw err;
    }
    // 合并：未传字段用旧值
    const merged = Object.assign({}, existing, b);
    // 把 number 转回原值（existing 里已是 number）
    merged.day_of_week = Number(merged.day_of_week);

    // 冲突检查：诊室
    const roomConflict = db.prepare(
      'SELECT id FROM schedules WHERE campus_code = ? AND room_id = ? AND day_of_week = ? AND time_slot_code = ? AND id != ?'
    ).get(merged.campus_code, merged.room_id, merged.day_of_week, merged.time_slot_code, sid);
    if (roomConflict) {
      const err = new Error('该诊室该周次该时段已有排班');
      err.code = 'SCH_CONFLICT';
      err.httpStatus = 409;
      err.details = { conflictId: roomConflict.id };
      throw err;
    }
    // 冲突检查：医生
    const docConflict = db.prepare(
      'SELECT id FROM schedules WHERE doctor_id = ? AND day_of_week = ? AND time_slot_code = ? AND id != ?'
    ).get(merged.doctor_id, merged.day_of_week, merged.time_slot_code, sid);
    if (docConflict) {
      const err = new Error('该医生该周次该时段已安排其他诊室');
      err.code = 'SCH_DOCTOR_BUSY';
      err.httpStatus = 409;
      err.details = { conflictId: docConflict.id };
      throw err;
    }

    const fields = ['doctor_id', 'doctor_name', 'work_id', 'department', 'campus_code', 'campus_name', 'zone_code', 'zone_name', 'room_id', 'room_name', 'clinic_type_code', 'clinic_type_name', 'time_slot_id', 'time_slot_code', 'period', 'start_time', 'end_time', 'day_of_week', 'remark', 'patient_limit'];
    const sets = fields.map(f => f + ' = ?').join(',');
    const values = fields.map(f => merged[f] ?? null);
    return db.prepare('UPDATE schedules SET ' + sets + ", updated_at = datetime('now', 'localtime') WHERE id = ?").run(...values, sid);
  });

  let info;
  try {
    info = updateRow(id);
  } catch (e) {
    if (e.code && ERR[e.code]) {
      throw biz(ERR[e.code], e.message, e.details);
    }
    throw e;
  }
  audit(req.user.id, req.user.username, 'update', 'schedules', req.params.id, b, req.ip);
  res.json(ok({ updated: info.changes }));
}));

/**
 * 删除
 */
router.delete('/:id', requireAuth, requireRole([ROLES.ADMIN]), scheduleWriteLimiter, asyncHandler((req, res) => {
  // 删除限制为 admin（editor 不能删除）
  const info = getDb().prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  audit(req.user.id, req.user.username, 'delete', 'schedules', req.params.id, null, req.ip);
  res.json(ok({ deleted: info.changes }));
}));

/**
 * 批量导入（小程序 batchAddSchedules 的服务端版本）
 * POST /api/schedules/batch
 * Body: { list: [...] }
 *   - 单次最多 500 条
 */
router.post('/batch', requireAuth, requireRole(PERMISSIONS.WRITE_BUSINESS), scheduleWriteLimiter, (req, res) => {
  const { list } = req.body || {};
  if (!Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ success: false, error: 'list 必须是数组' });
  }
  if (list.length > 500) {
    return res.status(400).json({ success: false, error: '单次最多 500 条' });
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((rows) => {
    for (let i = 0; i < rows.length; i++) {
      const b = rows[i];
      // 同时接受 camelCase（与 GET /api/schedules 返回一致）和 snake_case
      const g = (k1, k2) => b[k1] != null ? b[k1] : b[k2];
      const doctorId = g('doctorId', 'doctor_id');
      const roomId = g('roomId', 'room_id');
      const dayOfWeek = g('dayOfWeek', 'day_of_week');
      const timeSlotCode = g('timeSlotCode', 'time_slot_code');
      const campusCode = g('campusCode', 'campus_code');
      if (!doctorId || !roomId || !dayOfWeek || !timeSlotCode) {
        throw new Error('第 ' + (i + 1) + ' 条：缺少必填 (doctorId/roomId/dayOfWeek/timeSlotCode)');
      }
      // #P0-10 修复：批量导入也调 validateDayOfWeek，0/8/非数字 全部走 VAL_INVALID
      // 之前 Number('foo') → NaN 静默写入 DB，后续 week 过滤全失效
      let validDow
      try {
        validDow = validateDayOfWeek(dayOfWeek)
      } catch (e) {
        // 把 BizError 包成普通错误让外层 try/catch 走 errors 累积路径
        throw new Error('第 ' + (i + 1) + ' 条：' + (e.message || 'dayOfWeek 不合法'))
      }
      const c = db.prepare(
        'SELECT id FROM schedules WHERE campus_code = ? AND room_id = ? AND day_of_week = ? AND time_slot_code = ?'
      ).get(campusCode, roomId, validDow, timeSlotCode);
      if (c) {
        conflicts.push(roomId + ' ' + timeSlotCode);
        continue;
      }
      insertOne.run(
        g('doctorId','doctor_id'), g('doctorName','doctor_name'), g('workId','work_id')||'', g('department','department')||'',
        g('campusCode','campus_code'), g('campusName','campus_name')||'', g('zoneCode','zone_code')||'', g('zoneName','zone_name')||'',
        g('roomId','room_id'), g('roomName','room_name')||'',
        g('clinicTypeCode','clinic_type_code')||'', g('clinicTypeName','clinic_type_name')||'',
        g('timeSlotId','time_slot_id')||null, g('timeSlotCode','time_slot_code'), g('period','period')||'', g('startTime','start_time')||'', g('endTime','end_time')||'',
        Number(g('dayOfWeek','day_of_week')), g('remark','remark')||'', g('patientLimit','patient_limit')||null
      );
      inserted++;
    }
  });
  try {
    tx(list);
    audit(req.user.id, req.user.username, 'batch_create', 'schedules', null, { count: inserted, conflicts }, req.ip);
    if (conflicts.length > 0) {
      return res.json({ success: false, error: '部分冲突：' + conflicts.join(', '), conflicts });
    }
    res.json({ success: true, inserted });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});
/**

 * POST /api/schedules/copy-week
 * Body: { sourceDate: 'YYYY-MM-DD', targetDate: 'YYYY-MM-DD', campusCode?: 'YX', overwrite?: bool }
 *  - overwrite=false(默认): 跳过已有冲突的 (room, slot)，不报错
 *  - overwrite=true:         删掉 target 已存在的 (room, slot) 再插入
 *  限定 campusCode 时仅复制/覆盖该院区
 */
router.post('/copy-week', requireAuth, requireRole(PERMISSIONS.WRITE_BUSINESS), scheduleWriteLimiter, (req, res) => {
  const { sourceDate, targetDate, campusCode, overwrite } = req.body || {};
  if (!sourceDate || !targetDate) {
    return res.status(400).json({ success: false, error: 'sourceDate 和 targetDate 必填' });
  }
  // ISO 周一到周日：getDay() 返回 0-6，0=周日 → 映射为 7
  const dowOf = (s) => { const d = new Date(s); const x = d.getDay(); return x === 0 ? 7 : x; };
  let srcDow, tgtDow;
  try {
    srcDow = dowOf(sourceDate);
    tgtDow = dowOf(targetDate);
  } catch (e) {
    return res.status(400).json({ success: false, error: '日期格式错误' });
  }
  if (srcDow === tgtDow) {
    return res.status(400).json({ success: false, error: 'sourceDate 与 targetDate 同一天（dayOfWeek 相同），无需复制' });
  }

  const db = getDb();
  // 兼容历史数据：有的行可能存的是 0（Sunday 的旧值），用 IN 兜底
  const srcDowVariants = srcDow === 7 ? [7, 0] : [srcDow];
  const params = srcDowVariants;
  let where = 'day_of_week IN (' + srcDowVariants.map(() => '?').join(',') + ')';
  if (campusCode) { where += ' AND campus_code = ?'; params.push(campusCode); }
  const srcRows = db.prepare('SELECT * FROM schedules WHERE ' + where).all(...params);
  if (srcRows.length === 0) {
    return res.json({ success: true, sourceCount: 0, inserted: 0, overwritten: 0, skipped: 0, message: '源模板为空' });
  }

  const doOverwrite = overwrite === true;
  let inserted = 0, overwritten = 0, skipped = 0;
  const conflictKeys = [];

  // target 也兼容旧值 0（Sundown 历史数据）
  const tgtDowVariants = tgtDow === 7 ? [7, 0] : [tgtDow];
  const findExisting = db.prepare(
    'SELECT id FROM schedules WHERE campus_code = ? AND room_id = ? AND day_of_week IN (' +
    tgtDowVariants.map(() => '?').join(',') + ') AND time_slot_code = ?'
  );
  const delExisting = db.prepare('DELETE FROM schedules WHERE id = ?');
  const insertOne = db.prepare(`
    INSERT INTO schedules (
      doctor_id, doctor_name, work_id, department,
      campus_code, campus_name, zone_code, zone_name,
      room_id, room_name,
      clinic_type_code, clinic_type_name,
      time_slot_id, time_slot_code, period, start_time, end_time,
      day_of_week, remark, patient_limit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const fields = [
    'doctor_id', 'doctor_name', 'work_id', 'department',
    'campus_code', 'campus_name', 'zone_code', 'zone_name',
    'room_id', 'room_name',
    'clinic_type_code', 'clinic_type_name',
    'time_slot_id', 'time_slot_code', 'period', 'start_time', 'end_time',
    'day_of_week', 'remark', 'patient_limit'
  ];

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const exist = findExisting.get(r.campus_code, r.room_id, ...tgtDowVariants, r.time_slot_code);
      if (exist) {
        if (!doOverwrite) { skipped++; continue; }
        delExisting.run(exist.id);
        overwritten++;
      }
      const values = fields.map((f) => {
        if (f === 'day_of_week') return tgtDow;
        return r[f] ?? null;
      });
      insertOne.run(...values);
      inserted++;
    }
  });

  try {
    tx(srcRows);
    audit(req.user.id, req.user.username, 'copy_week', 'schedules', null,
      { sourceDate, targetDate, campusCode: campusCode || '*', overwrite: doOverwrite, srcCount: srcRows.length, inserted, overwritten, skipped },
      req.ip);
    res.json({ success: true, sourceCount: srcRows.length, inserted, overwritten, skipped, fromDow: srcDow, toDow: tgtDow });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;

/**
 * GET /api/schedules/conflicts
 * 排班冲突检测（前端表单实时检查用）
 * Query:
 *   - campusCode / roomId / dayOfWeek / timeSlotCode  诊室冲突（4 选 1+）
 *   - doctorId / dayOfWeek / timeSlotCode  医生冲突（可选）
 *   - excludeId  排除自己的 _id（编辑时用）
 * 返回：{ success, conflicts: [{ _id, doctorName, roomId, period, ... }] }
 */
// GET /api/schedules/conflicts（已添加 requireAuth）
router.get('/conflicts', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { campusCode, roomId, dayOfWeek, timeSlotCode, doctorId, excludeId } = req.query;
    const conflicts = [];
    const roomQuery = db.prepare(
      'SELECT id, doctor_id, doctor_name, work_id, room_id, day_of_week, time_slot_code, period, start_time, end_time, campus_code, campus_name, zone_name, room_name ' +
      'FROM schedules WHERE day_of_week = ? AND time_slot_code = ? AND campus_code = ? AND room_id = ?' +
      (excludeId ? ' AND id != ?' : '')
    );
    const docQuery = db.prepare(
      'SELECT id, doctor_id, doctor_name, work_id, room_id, day_of_week, time_slot_code, period, start_time, end_time, campus_code, campus_name, zone_name, room_name ' +
      'FROM schedules WHERE day_of_week = ? AND time_slot_code = ? AND doctor_id = ?' +
      (excludeId ? ' AND id != ?' : '')
    );
    if (campusCode && roomId && dayOfWeek && timeSlotCode) {
      const params = [Number(dayOfWeek), String(timeSlotCode), String(campusCode), String(roomId)];
      if (excludeId) params.push(Number(excludeId));
      roomQuery.all(...params).forEach(c => conflicts.push(Object.assign({ type: 'room' }, c)));
    }
    if (doctorId && dayOfWeek && timeSlotCode) {
      const params = [Number(dayOfWeek), String(timeSlotCode), Number(doctorId)];
      if (excludeId) params.push(Number(excludeId));
      docQuery.all(...params).forEach(c => conflicts.push(Object.assign({ type: 'doctor' }, c)));
    }
    res.json({ success: true, total: conflicts.length, conflicts });
  } catch (e) {
    log.error('conflicts.failed', { query: req.query }, e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/schedules/available-slots
 * 智能推荐：给定 (campus, room, day) 列出所有空闲时段
 * Query: campusCode, roomId, dayOfWeek, excludeId
 * 返回: { success, slots: [{ code, name, period, startTime, endTime, occupied }] }
 */
router.get('/available-slots', requireAuth, asyncHandler((req, res) => {
  const db = getDb();
  const { campusCode, roomId, dayOfWeek, excludeId } = req.query;
  if (!campusCode || !roomId || !dayOfWeek) {
    throw biz(ERR.VAL_REQUIRED, 'campusCode/roomId/dayOfWeek 必填');
  }
  const allSlots = db.prepare('SELECT * FROM time_slots WHERE campus_code = ? ORDER BY period, start_time').all(String(campusCode));
  const occupied = db.prepare(
    'SELECT time_slot_code FROM schedules WHERE campus_code = ? AND room_id = ? AND day_of_week = ?' +
    (excludeId ? ' AND id != ?' : '')
  ).all(String(campusCode), String(roomId), Number(dayOfWeek), ...(excludeId ? [Number(excludeId)] : []));
  const occupiedSet = new Set(occupied.map(o => o.time_slot_code));
  const result = allSlots.map(s => ({
    code: s.code,
    name: s.name,
    period: s.period,
    startTime: s.start_time,
    endTime: s.end_time,
    occupied: occupiedSet.has(s.code)
  }));
  res.json(ok({ slots: result, total: result.length }));
}));

/**
 * GET /api/schedules/recommend
 * 智能推荐排班组合：给定 (campus, doctor, day) → 返回 (room, slot) 可用组合
 *   - 排除该医生当天已有排班
 *   - 排除该诊室当天已被占用的时段
 *   - 优先推荐同科室的诊室
 * Query: campusCode, doctorId, dayOfWeek
 * 返回: { success, recommendations: [{ roomId, roomName, slotCode, slotName, period, startTime, endTime, score }] }
 */
router.get('/recommend', requireAuth, asyncHandler((req, res) => {
  const db = getDb();
  const { campusCode, doctorId, dayOfWeek } = req.query;
  if (!campusCode || !dayOfWeek) {
    throw biz(ERR.VAL_REQUIRED, 'campusCode/dayOfWeek 必填');
  }
  const dow = Number(dayOfWeek);

  // 候选时段：该院区所有时段
  const allSlots = db.prepare('SELECT * FROM time_slots WHERE campus_code = ? ORDER BY period, start_time').all(String(campusCode));
  if (allSlots.length === 0) {
    return res.json(ok({ recommendations: [] }));
  }

  // 候选诊室：该院区所有诊室
  const allRooms = db.prepare('SELECT room_id, room_name, department, zone_name FROM rooms WHERE campus_code = ? ORDER BY room_id').all(String(campusCode));
  if (allRooms.length === 0) {
    return res.json(ok({ recommendations: [] }));
  }

  // 该医生当天已被占用的时段码
  let doctorBusySlots = new Set();
  if (doctorId) {
    const rows = db.prepare('SELECT time_slot_code FROM schedules WHERE doctor_id = ? AND day_of_week = ?')
      .all(Number(doctorId), dow);
    doctorBusySlots = new Set(rows.map(r => r.time_slot_code));
  }

  // 医生所属科室（用于排序权重）
  let doctorDept = null;
  if (doctorId) {
    const d = db.prepare('SELECT department FROM doctors WHERE id = ?').get(Number(doctorId));
    if (d) doctorDept = d.department;
  }

  // 已被诊室+时段占用的 (roomId, timeSlotCode) 集合
  const occupiedRows = db.prepare(
    'SELECT room_id, time_slot_code FROM schedules WHERE campus_code = ? AND day_of_week = ?'
  ).all(String(campusCode), dow);
  const occupiedSet = new Set(occupiedRows.map(r => r.room_id + '|' + r.time_slot_code));

  // 生成所有 (room, slot) 组合，过滤已占 + 医生忙
  const recs = [];
  for (const room of allRooms) {
    for (const slot of allSlots) {
      if (occupiedSet.has(room.room_id + '|' + slot.code)) continue;
      if (doctorBusySlots.has(slot.code)) continue;
      // 评分：同科室 +10；上午时段 +1；中午 +0；下午 +1；夜班 -1
      let score = 0;
      if (doctorDept && room.department === doctorDept) score += 10;
      if (slot.period === '上午' || slot.period === '下午') score += 1;
      if (slot.period === '夜班') score -= 1;
      recs.push({
        roomId: room.room_id,
        roomName: room.room_name,
        zoneName: room.zone_name,
        department: room.department,
        slotCode: slot.code,
        slotName: slot.name,
        period: slot.period,
        startTime: slot.start_time,
        endTime: slot.end_time,
        score
      });
    }
  }

  recs.sort((a, b) => b.score - a.score || a.roomId.localeCompare(b.roomId) || a.slotCode.localeCompare(b.slotCode));
  res.json(ok({ recommendations: recs.slice(0, 20), total: recs.length }));
}));
/**
 * 详情
 * 必须放在最后，避免抢占 /conflicts /available-slots /recommend 等特殊路径
 */
router.get('/:id', requireAuth, asyncHandler((req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.json({ success: false, code: 'SYS_NOT_FOUND' });
  const row = getDb().prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  if (!row) throw biz(ERR.SCH_NOT_FOUND, '排班不存在');
  res.json(ok(toApi(row)));
}));
