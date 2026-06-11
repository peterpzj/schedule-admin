-- 006: 时间轴视图查询优化
-- 新增 ScheduleTimeline.vue 后，前端高频查询：
--   GET /api/schedules?campusCode=HP&zoneCode=HP-Z1&dayOfWeek=3
-- 现有索引（001 末尾 + 004）：
--   idx_schedules_date ON schedules(day_of_week)
--   idx_schedules_doctor ON schedules(doctor_id)
--   idx_schedules_campus ON schedules(campus_code)
-- 这三个单列索引对三维过滤（campus+zone+dayOfWeek）只能各自走一个，
-- SQLite 查询优化器会选择其中一个（campus 最常驻），其余两维走 filter。
-- 数据量大时（例如跨院区累计数万行排班）会出现数百 ms 延迟。
--
-- 解决方案：复合索引 (campus_code, zone_code, day_of_week, room_id, period)
-- 1. campus_code 在前：与时间轴最常见按院区筛选的场景契合
-- 2. day_of_week 第三位：覆盖单院区/单诊区 + 7 天切换的高频访问
-- 3. room_id + period：覆盖 ORDER BY room_id, period 的输出排序
--
-- 代价：
--   - INSERT/UPDATE/DELETE 时需要维护额外索引，单条写开销 ~10%
--   - 索引文件大小：每行约 30 字节，1 万行约 300KB，可忽略

CREATE INDEX IF NOT EXISTS idx_schedules_axis
  ON schedules(campus_code, zone_code, day_of_week, room_id, period);