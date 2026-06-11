/**
 * 公共查询函数
 */
const { getDb } = require('./index');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * 获取所有基础数据（聚合接口）
 *
 * query.limits = { campuses, departments, clinicTypes, zones, rooms, timeSlots, doctors }
 *   - 缺省取 DEFAULT_LIMIT (200)，上限 MAX_LIMIT (1000)
 *   - 实际超过 limit 的表会附带 warnings 数组（顶层 warnings 字段）
 */
function collectMetadata(query = {}) {
  const db = getDb();
  const { campusCode, zoneCode } = query;
  const rawLimits = query.limits || {};
  const limitOf = (k) => {
    const n = parseInt(rawLimits[k], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(MAX_LIMIT, n);
    return DEFAULT_LIMIT;
  };

  const out = {};
  const warnings = [];

  const push = (key, sql, params, limit) => {
    const r = limited(db, sql, params, limit);
    out[key] = r.rows;
    for (const w of r.warnings) warnings.push(w);
  };

  push('campuses',    'SELECT * FROM campuses ORDER BY sort_order', [], limitOf('campuses'));
  push('departments', 'SELECT * FROM departments ORDER BY id', [], limitOf('departments'));
  push('clinicTypes', 'SELECT * FROM clinic_types ORDER BY sort_order', [], limitOf('clinicTypes'));
  push('zones',
    campusCode
      ? 'SELECT * FROM zones WHERE campus_code = ? ORDER BY sort_order'
      : 'SELECT * FROM zones ORDER BY sort_order',
    campusCode ? [campusCode] : [], limitOf('zones'));
  push('rooms',
    (campusCode && zoneCode)
      ? 'SELECT * FROM rooms WHERE campus_code = ? AND zone_code = ? ORDER BY room_id'
      : campusCode
        ? 'SELECT * FROM rooms WHERE campus_code = ? ORDER BY room_id'
        : 'SELECT * FROM rooms ORDER BY campus_code, room_id',
    (campusCode && zoneCode) ? [campusCode, zoneCode] : campusCode ? [campusCode] : [],
    limitOf('rooms'));
  push('timeSlots',
    campusCode
      ? 'SELECT * FROM time_slots WHERE campus_code = ? ORDER BY sort_order'
      : 'SELECT * FROM time_slots ORDER BY sort_order',
    campusCode ? [campusCode] : [], limitOf('timeSlots'));
  push('doctors', 'SELECT * FROM doctors ORDER BY work_id', [], limitOf('doctors'));

  out.warnings = warnings;
  return out;
}

function limited(db, sql, params, limit) {
  const total = db.prepare('SELECT COUNT(*) AS c FROM (' + sql + ')').get(...params).c;
  if (total <= limit) {
    return { rows: db.prepare(sql + ' LIMIT ?').all(...params, limit), warnings: [] };
  }
  return {
    rows: db.prepare(sql + ' LIMIT ?').all(...params, limit),
    warnings: [{ table: sql.match(/FROM\s+(\w+)/i)[1], returned: limit, total }]
  };
}

// 向后兼容旧调用方
function getAllMetadata(query = {}) {
  return collectMetadata(query);
}

module.exports = { getAllMetadata, collectMetadata, DEFAULT_LIMIT, MAX_LIMIT };