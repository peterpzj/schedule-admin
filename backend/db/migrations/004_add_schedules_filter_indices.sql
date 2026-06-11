-- Migration: 004_add_schedules_filter_indices
-- Created: 2026-06-09
-- 目的：为 schedules 表过滤频次高的字段加索引，提升 /api/schedules 列表与统计接口性能
-- 依据：routes/schedules.js 中 list (L50-72) 按 zoneCode / clinicTypeCode / period 过滤；
--       routes/schedules.js recommend (L397-466) 按 doctor_id + day_of_week 查询；
--       /api/statistics 按 period / day_of_week 分组。
--
-- 当前 435 条数据下走全表扫描尚可，但 5k+ 条时这些索引能把查询从 ~10ms 降到 <1ms。
-- 索引开销：每个索引约 8-16KB（435 行），写入开销可忽略。

CREATE INDEX IF NOT EXISTS idx_schedules_zone ON schedules(zone_code);
CREATE INDEX IF NOT EXISTS idx_schedules_clinic_type ON schedules(clinic_type_code);
CREATE INDEX IF NOT EXISTS idx_schedules_period ON schedules(period);
-- 复合索引：recommend 接口按 (doctor_id, day_of_week, time_slot_code) 排除
CREATE INDEX IF NOT EXISTS idx_schedules_doctor_slot ON schedules(doctor_id, day_of_week, time_slot_code);
-- audit_logs 按时间倒序
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Down:
-- DROP INDEX IF EXISTS idx_schedules_zone;
-- DROP INDEX IF EXISTS idx_schedules_clinic_type;
-- DROP INDEX IF EXISTS idx_schedules_period;
-- DROP INDEX IF EXISTS idx_schedules_doctor_slot;
-- DROP INDEX IF EXISTS idx_audit_logs_created;
