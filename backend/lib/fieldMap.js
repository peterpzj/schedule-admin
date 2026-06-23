/**
 * 字段映射工具 (R2 阶段重构)
 *
 * 统一前后端字段命名差异:
 *   - 前端 (Vue/小程序) 习惯 camelCase
 *   - 数据库 + 后端内部用 snake_case
 *
 * 三个工具:
 *   - CAMEL_TO_SNAKE : camelCase -> snake_case 字典(也反向作为 SNAKE_TO_CAMEL)
 *   - normalizeBody  : 接受 POST/PUT body(camelCase 或 snake_case),归一为 snake_case
 *   - toApi          : 接受 DB 行 (snake_case),转 API 行 (camelCase),加 _id 别名
 *
 * 单一来源:所有路由的字段映射都走这里,避免散落各处的不一致。
 */
const CAMEL_TO_SNAKE = {
  doctorId: 'doctor_id', doctorName: 'doctor_name',
  workId: 'work_id', department: 'department',
  campusCode: 'campus_code', campusName: 'campus_name',
  zoneCode: 'zone_code', zoneName: 'zone_name',
  roomId: 'room_id', roomName: 'room_name',
  clinicTypeCode: 'clinic_type_code', clinicTypeName: 'clinic_type_name',
  timeSlotId: 'time_slot_id', timeSlotCode: 'time_slot_code',
  period: 'period', startTime: 'start_time', endTime: 'end_time',
  dayOfWeek: 'day_of_week', remark: 'remark', patientLimit: 'patient_limit',
  // 兼容老别名
  doctor_id: 'doctor_id', doctor_name: 'doctor_name',
  work_id: 'work_id',
  campus_code: 'campus_code', campus_name: 'campus_name',
  zone_code: 'zone_code', zone_name: 'zone_name',
  room_id: 'room_id', room_name: 'room_name',
  clinic_type_code: 'clinic_type_code', clinic_type_name: 'clinic_type_name',
  time_slot_code: 'time_slot_code',
  start_time: 'start_time', end_time: 'end_time',
  day_of_week: 'day_of_week', patient_limit: 'patient_limit'
};

/**
 * 接受 camelCase 或 snake_case body,归一为 snake_case
 * - 已知 camelCase key -> snake_case value
 * - 已知 snake_case key -> 保持
 * - 未知 key         -> 保持原样(透传字段)
 */
function normalizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    const mapped = CAMEL_TO_SNAKE[k] || k;
    out[mapped] = v;
  }
  return out;
}

/**
 * 把 DB 行(snake_case keys)转 API 行(camelCase keys + _id)
 * - snake_case 优先
 * - 同名字段跳过
 * - 强制把 id 转 _id
 */
function toApi(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    // 已是 snake_case 字段,跳过
    if (k.includes('_') && /^[a-z][a-z0-9_]*$/.test(k)) {
      // 找对应的 camelCase
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      out[camel] = v;
    } else {
      out[k] = v;
    }
  }
  if ('id' in row && !('_id' in out)) out._id = row.id;
  return out;
}

module.exports = {
  CAMEL_TO_SNAKE,
  normalizeBody,
  toApi
};
