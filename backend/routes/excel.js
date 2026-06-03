/**
 * Excel 导入 / 导出 / 模板下载
 */
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../middleware/audit');

// 上传目录
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },  // 10MB
  fileFilter: (req, file, cb) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname)) {
      return cb(new Error('仅支持 .xlsx / .xls / .csv 文件'));
    }
    cb(null, true);
  }
});

/**
 * 字段映射：sheet 名 → 表名 → 列 → 数据库字段
 */
const SHEET_CONFIG = {
  '1-院区': {
    table: 'campuses',
    fields: {
      'name': 'name',
      'code': 'code',
      '排序': 'sort_order'
    },
    required: ['name', 'code']
  },
  '2-科室': {
    table: 'departments',
    fields: { 'name': 'name', 'code': 'code' },
    required: ['name', 'code']
  },
  '3-门诊类型': {
    table: 'clinic_types',
    fields: { 'name': 'name', 'code': 'code', '排序': 'sort_order' },
    required: ['name', 'code']
  },
  '4-诊区': {
    table: 'zones',
    fields: { 'name': 'name', 'code': 'code', '院区代码': 'campus_code', '院区名称': 'campus_name', '排序': 'sort_order' },
    required: ['name', 'code', '院区代码', '院区名称']
  },
  '5-诊室': {
    table: 'rooms',
    fields: {
      '诊室编号': 'room_id', '诊室名称': 'room_name',
      '院区代码': 'campus_code', '院区名称': 'campus_name',
      '诊区代码': 'zone_code', '诊区名称': 'zone_name',
      '归属科室': 'department'
    },
    required: ['诊室编号', '诊室名称', '院区代码', '诊区代码']
  },
  '6-时段': {
    table: 'time_slots',
    fields: {
      '名称': 'name', '代码': 'code',
      '院区代码': 'campus_code', '院区名称': 'campus_name',
      '门诊类型代码': 'clinic_type_code', '门诊类型名称': 'clinic_type_name',
      '午别': 'period', '开始时间': 'start_time', '结束时间': 'end_time', '排序': 'sort_order'
    },
    required: ['名称', '代码', '院区代码', '门诊类型代码', '午别', '开始时间', '结束时间']
  },
  '7-医生': {
    table: 'doctors',
    fields: {
      '姓名': 'name', '工号': 'work_id', '科室': 'department',
      '职称': 'title', '其他职称': 'other_title', '主院区': 'primary_campus'
    },
    required: ['姓名', '工号', '科室']
  },
  '8-排班': {
    table: 'schedules',
    fields: {
      '医生ID': 'doctor_id', '医生姓名': 'doctor_name', '工号': 'work_id', '科室': 'department',
      '院区代码': 'campus_code', '院区名称': 'campus_name',
      '诊区代码': 'zone_code', '诊区名称': 'zone_name',
      '诊室编号': 'room_id', '诊室名称': 'room_name',
      '门诊类型代码': 'clinic_type_code', '门诊类型名称': 'clinic_type_name',
      '时段代码': 'time_slot_code', '午别': 'period',
      '开始时间': 'start_time', '结束时间': 'end_time',
      '周次': 'day_of_week', '备注': 'remark', '限号数': 'patient_limit'
    },
    required: ['医生ID', '医生姓名', '院区代码', '诊室编号', '时段代码', '周次']
  }
};

/**
 * POST /api/excel/import
 * 上传一个 .xlsx 文件，每个 sheet 名称对应一个表
 * 字段必须以「使用说明」sheet 为准
 */
router.post('/import', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: '未上传文件' });
  const dryRun = req.body.dryRun === 'true' || req.body.dryRun === '1';

  let wb;
  try {
    wb = XLSX.readFile(req.file.path);
  } catch (e) {
    return res.status(400).json({ success: false, error: '文件解析失败：' + e.message });
  }

  const db = getDb();
  const summary = {};
  const errors = [];

  for (const sheetName of wb.SheetNames) {
    const config = SHEET_CONFIG[sheetName];
    if (!config) {
      summary[sheetName] = { skipped: true, reason: '未识别的 sheet（应使用模板的 sheet 名）' };
      continue;
    }
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    // 过滤示例行（标记为「示例（可删除）」或字段全空的）
    const validRows = rows.filter(r => {
      const v = r['姓名'] || r['诊室编号'] || r['医生姓名'] || r['名称'] || r['工号'];
      if (!v) return false;
      if (typeof v === 'string' && v.includes('示例')) return false;
      return true;
    });

    let inserted = 0;
    let skipped = 0;
    for (const row of validRows) {
      // 映射字段
      const mapped = {};
      for (const [colName, dbField] of Object.entries(config.fields)) {
        const v = row[colName];
        if (v === undefined || v === '') {
          if (config.required.includes(colName)) {
            errors.push({ sheet: sheetName, msg: '必填字段缺失：' + colName, row });
            continue;
          }
        } else {
          mapped[dbField] = v;
        }
      }
      // 校验必填
      const missing = config.required.filter(c => row[c] === undefined || row[c] === '');
      if (missing.length > 0) {
        skipped++;
        errors.push({ sheet: sheetName, msg: '缺失必填：' + missing.join(', '), row });
        continue;
      }
      // 类型转换
      if (mapped.sort_order) mapped.sort_order = Number(mapped.sort_order) || 0;
      if (mapped.patient_limit) mapped.patient_limit = Number(mapped.patient_limit) || null;
      if (mapped.day_of_week) mapped.day_of_week = Number(mapped.day_of_week);
      if (mapped.doctor_id) mapped.doctor_id = Number(mapped.doctor_id);

      if (dryRun) { inserted++; continue; }

      try {
        const fields = Object.keys(mapped);
        const placeholders = fields.map(() => '?').join(',');
        const values = fields.map(f => mapped[f]);
        db.prepare('INSERT OR REPLACE INTO ' + config.table + ' (' + fields.join(',') + ') VALUES (' + placeholders + ')').run(...values);
        inserted++;
      } catch (e) {
        skipped++;
        errors.push({ sheet: sheetName, msg: e.message, row });
      }
    }
    summary[sheetName] = { inserted, skipped, total: validRows.length };
  }

  // 清理临时文件
  try { fs.unlinkSync(req.file.path); } catch (_) {}

  audit(req.user.id, req.user.username, dryRun ? 'import_dry_run' : 'import', 'excel', null, summary, req.ip);
  res.json({ success: true, dryRun, summary, errors: errors.slice(0, 50) });
});

/**
 * GET /api/excel/export
 * 导出全部数据到一个 .xlsx 文件
 * Query: type=schedules|campuses|all
 */
router.get('/export', requireAuth, (req, res) => {
  const db = getDb();

  const wb = XLSX.utils.book_new();

  // 1-院区
  const campuses = db.prepare('SELECT name as 名称, code as 代码, sort_order as 排序 FROM campuses ORDER BY sort_order').all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(campuses), '1-院区');

  // 2-科室
  const depts = db.prepare('SELECT name as 名称, code as 代码 FROM departments ORDER BY id').all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(depts), '2-科室');

  // 3-门诊类型
  const cts = db.prepare('SELECT name as 名称, code as 代码, sort_order as 排序 FROM clinic_types ORDER BY sort_order').all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cts), '3-门诊类型');

  // 4-诊区
  const zones = db.prepare('SELECT name as 名称, code as 代码, campus_code as 院区代码, campus_name as 院区名称, sort_order as 排序 FROM zones ORDER BY campus_code, sort_order').all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(zones), '4-诊区');

  // 5-诊室
  const rooms = db.prepare('SELECT room_id as 诊室编号, room_name as 诊室名称, campus_code as 院区代码, campus_name as 院区名称, zone_code as 诊区代码, zone_name as 诊区名称, department as 归属科室 FROM rooms ORDER BY campus_code, room_id').all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rooms), '5-诊室');

  // 6-时段
  const slots = db.prepare('SELECT name as 名称, code as 代码, campus_code as 院区代码, campus_name as 院区名称, clinic_type_code as 门诊类型代码, clinic_type_name as 门诊类型名称, period as 午别, start_time as 开始时间, end_time as 结束时间, sort_order as 排序 FROM time_slots ORDER BY campus_code, sort_order').all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(slots), '6-时段');

  // 7-医生
  const docs = db.prepare('SELECT name as 姓名, work_id as 工号, department as 科室, title as 职称, other_title as 其他职称, primary_campus as 主院区 FROM doctors ORDER BY work_id').all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docs), '7-医生');

  // 8-排班
  const scheds = db.prepare(`
    SELECT doctor_id as 医生ID, doctor_name as 医生姓名, work_id as 工号, department as 科室,
           campus_code as 院区代码, campus_name as 院区名称,
           zone_code as 诊区代码, zone_name as 诊区名称,
           room_id as 诊室编号, room_name as 诊室名称,
           clinic_type_code as 门诊类型代码, clinic_type_name as 门诊类型名称,
           time_slot_code as 时段代码, period as 午别,
           start_time as 开始时间, end_time as 结束时间,
           day_of_week as 周次, remark as 备注, patient_limit as 限号数
    FROM schedules ORDER BY campus_code, day_of_week, period, room_id
  `).all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheds), '8-排班');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = '排班数据备份_' + new Date().toISOString().slice(0, 10) + '.xlsx';

  audit(req.user.id, req.user.username, 'export', 'excel', null, null, req.ip);

  res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

/**
 * GET /api/excel/template
 * 下载空模板（含表头和示例行）
 */
router.get('/template', requireAuth, (req, res) => {
  const wb = XLSX.utils.book_new();
  // 提供带表头和 1-2 行示例的空模板
  const examples = {
    '1-院区': [{ '名称': '示例院区', '代码': 'XX', '排序': 1 }],
    '2-科室': [{ '名称': '示例科室', '代码': 'XXKS' }],
    '3-门诊类型': [{ '名称': '示例门诊', '代码': 'XXMZ', '排序': 1 }],
    '4-诊区': [{ '名称': '1诊区', '代码': 'YX-Z1', '院区代码': 'YX', '院区名称': '越秀院区', '排序': 1 }],
    '5-诊室': [{ '诊室编号': '301', '诊室名称': '301诊室', '院区代码': 'YX', '院区名称': '越秀院区', '诊区代码': 'YX-Z1', '诊区名称': '1诊区', '归属科室': '内科' }],
    '6-时段': [{ '名称': '上午1段', '代码': 'YX-TX-AM1', '院区代码': 'YX', '院区名称': '越秀院区', '门诊类型代码': 'TESE', '门诊类型名称': '特需', '午别': '上午', '开始时间': '08:30', '结束时间': '10:30', '排序': 1 }],
    '7-医生': [{ '姓名': '示例医生', '工号': 'M001', '科室': '内科', '职称': '主任医师', '其他职称': '', '主院区': 'YX' }],
    '8-排班': [{ '医生ID': 1, '医生姓名': '示例医生', '工号': 'M001', '科室': '内科', '院区代码': 'YX', '院区名称': '越秀院区', '诊区代码': 'YX-Z1', '诊区名称': '1诊区', '诊室编号': '301', '诊室名称': '301诊室', '门诊类型代码': 'TESE', '门诊类型名称': '特需', '时段代码': 'YX-TX-AM1', '午别': '上午', '开始时间': '08:30', '结束时间': '10:30', '周次': 1, '备注': '', '限号数': 30 }]
  };
  for (const [name, rows] of Object.entries(examples)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  }
  // 加上使用说明 sheet
  const info = [
    { '说明': '请按各 sheet 字段填写；标 * 的为必填项；不要修改 sheet 名称' },
    { '说明': '诊室：同一 (院区代码, 诊室编号) 唯一；排班：同一 (院区代码, 诊室编号, 周次, 时段代码) 唯一' },
    { '说明': '医生ID 是数据库自增 ID，导出时才能看到；批量导入可省略' },
    { '说明': '周次 1=周一, 2=周二, 3=周三, 4=周四, 5=周五, 6=周六, 7=周日' }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), '使用说明');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="schedule_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

module.exports = router;
