
    -- 管理员账号
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT DEFAULT 'admin',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      last_login_at TEXT
    );

    -- 院区
    CREATE TABLE IF NOT EXISTS campuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 科室
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 门诊类型
    CREATE TABLE IF NOT EXISTS clinic_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 诊区（属于某个院区）
    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      campus_code TEXT NOT NULL,
      campus_name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (campus_code) REFERENCES campuses(code)
    );

    -- 诊室（属于某个诊区）
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      campus_code TEXT NOT NULL,
      campus_name TEXT NOT NULL,
      zone_code TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      department TEXT,
      status TEXT DEFAULT '空闲',
      capacity INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(campus_code, room_id),
      FOREIGN KEY (zone_code) REFERENCES zones(code)
    );

    -- 时段（属于某个院区 + 门诊类型）
    CREATE TABLE IF NOT EXISTS time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      campus_code TEXT NOT NULL,
      campus_name TEXT NOT NULL,
      clinic_type_code TEXT NOT NULL,
      clinic_type_name TEXT NOT NULL,
      period TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (campus_code) REFERENCES campuses(code),
      FOREIGN KEY (clinic_type_code) REFERENCES clinic_types(code)
    );

    -- 医生
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      work_id TEXT UNIQUE NOT NULL,
      department TEXT NOT NULL,
      title TEXT,
      other_title TEXT,
      primary_campus TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 排班（周模板）
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      doctor_name TEXT NOT NULL,
      work_id TEXT,
      department TEXT,
      campus_code TEXT NOT NULL,
      campus_name TEXT NOT NULL,
      zone_code TEXT,
      zone_name TEXT,
      room_id TEXT NOT NULL,
      room_name TEXT,
      clinic_type_code TEXT,
      clinic_type_name TEXT,
      time_slot_id INTEGER,
      time_slot_code TEXT,
      period TEXT,
      start_time TEXT,
      end_time TEXT,
      day_of_week INTEGER NOT NULL,
      remark TEXT,
      patient_limit INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT,
      UNIQUE(campus_code, room_id, day_of_week, time_slot_code),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (campus_code) REFERENCES campuses(code)
    );

    -- 操作日志（用于审计）
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      details TEXT,
      ip TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_rooms_campus ON rooms(campus_code);
    CREATE INDEX IF NOT EXISTS idx_rooms_zone ON rooms(zone_code);
    CREATE INDEX IF NOT EXISTS idx_zones_campus ON zones(campus_code);
    CREATE INDEX IF NOT EXISTS idx_slots_campus_type ON time_slots(campus_code, clinic_type_code);
    CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(day_of_week);
    CREATE INDEX IF NOT EXISTS idx_schedules_doctor ON schedules(doctor_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_campus ON schedules(campus_code);
  