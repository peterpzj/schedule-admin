/**
 * 公共查询函数
 */
const { getDb } = require('./index');

/**
 * 获取所有基础数据（聚合接口）
 */
function getAllMetadata(query = {}) {
  const db = getDb();
  const { campusCode, zoneCode } = query;
  return {
    campuses: db.prepare('SELECT * FROM campuses ORDER BY sort_order').all(),
    departments: db.prepare('SELECT * FROM departments ORDER BY id').all(),
    clinicTypes: db.prepare('SELECT * FROM clinic_types ORDER BY sort_order').all(),
    zones: campusCode
      ? db.prepare('SELECT * FROM zones WHERE campus_code = ? ORDER BY sort_order').all(campusCode)
      : db.prepare('SELECT * FROM zones ORDER BY sort_order').all(),
    rooms: (() => {
      if (campusCode && zoneCode) {
        return db.prepare('SELECT * FROM rooms WHERE campus_code = ? AND zone_code = ? ORDER BY room_id')
          .all(campusCode, zoneCode);
      } else if (campusCode) {
        return db.prepare('SELECT * FROM rooms WHERE campus_code = ? ORDER BY room_id').all(campusCode);
      } else {
        return db.prepare('SELECT * FROM rooms ORDER BY campus_code, room_id').all();
      }
    })(),
    timeSlots: campusCode
      ? db.prepare('SELECT * FROM time_slots WHERE campus_code = ? ORDER BY sort_order').all(campusCode)
      : db.prepare('SELECT * FROM time_slots ORDER BY sort_order').all(),
    doctors: db.prepare('SELECT * FROM doctors ORDER BY work_id').all()
  };
}

module.exports = { getAllMetadata };
