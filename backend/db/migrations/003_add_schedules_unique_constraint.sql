-- Migration: 003_add_schedules_unique_constraint
-- Created: 2026-06-08
-- 目的：防止 (campus_code, room_id, day_of_week, time_slot_code) 重复排班
-- 说明：数据库层唯一约束 + 应用层冲突检测双保险

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_unique ON schedules(campus_code, room_id, day_of_week, time_slot_code);

-- Down:
DROP INDEX IF EXISTS idx_schedules_unique;