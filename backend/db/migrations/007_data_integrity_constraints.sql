-- 007: 数据完整性约束 + 引用级联
--
-- 1) #P1-11 patient_limit 应用层校验非负，DB 层无 CHECK 约束
--    加 CHECK 约束：patient_limit IS NULL OR patient_limit >= 0
--    SQLite 不支持 ALTER TABLE ADD CONSTRAINT；只能通过表重建实现
--    但表 schedules 当前已有数据，简单 ALTER 会丢数据 → 用触发器兜底
--    触发器：BEFORE INSERT/UPDATE 校验 patient_limit 非负
--
-- 2) #P1-12 work_id 改后级联影响
--    现状：doctors.work_id 修改后，schedules.work_id 不会同步
--    方案：建触发器 AFTER UPDATE ON doctors 同步 schedules.work_id
--
-- 3) #P1-13 REFERENCE_CHECKS 补全（应用层）
--    _crud_factory.js 的 REFERENCE_CHECKS 当前只看 schedules
--    实际 rooms.zone_code → zones.code、time_slots.campus_code → campuses.code
--    等引用未检查。SQLite FK 没设 ON DELETE CASCADE，靠应用层校验。
--    DB 层不能跨表 CHECK → 在应用层补全（见 lib/referenceChecks.js）

-- 1) patient_limit 触发器
DROP TRIGGER IF EXISTS trg_schedules_patient_limit_check_ins;
CREATE TRIGGER trg_schedules_patient_limit_check_ins
  BEFORE INSERT ON schedules
  FOR EACH ROW
  WHEN NEW.patient_limit IS NOT NULL AND NEW.patient_limit < 0
BEGIN
  SELECT RAISE(ABORT, 'patient_limit must be >= 0 or NULL');
END;

DROP TRIGGER IF EXISTS trg_schedules_patient_limit_check_upd;
CREATE TRIGGER trg_schedules_patient_limit_check_upd
  BEFORE UPDATE ON schedules
  FOR EACH ROW
  WHEN NEW.patient_limit IS NOT NULL AND NEW.patient_limit < 0
BEGIN
  SELECT RAISE(ABORT, 'patient_limit must be >= 0 or NULL');
END;

-- 2) work_id 级联更新触发器
--    doctors.work_id 改了之后，把 schedules 表里所有相同 doctor_id 行的 work_id 同步
DROP TRIGGER IF EXISTS trg_doctors_work_id_cascade;
CREATE TRIGGER trg_doctors_work_id_cascade
  AFTER UPDATE OF work_id ON doctors
  FOR EACH ROW
  WHEN OLD.work_id != NEW.work_id
BEGIN
  UPDATE schedules
    SET work_id = NEW.work_id
    WHERE doctor_id = NEW.id AND (work_id = OLD.work_id OR work_id IS NULL);
END;

-- 索引：触发器 UPDATE 的 WHERE 条件需要 doctor_id 命中
-- doctor_id 已经有 idx_schedules_doctor，足够