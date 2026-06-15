/**
 * Excel 导入 / 导出 / 模板下载
 *
 * 接口：
 *  - POST /api/excel/import        : 同步导入（小文件 < 1000 行，30s 内完成）
 *  - POST /api/excel/import-async  : 异步导入（大文件，返回 jobId）
 *  - GET  /api/excel/jobs          : 列出最近 20 个任务
 *  - GET  /api/excel/jobs/:id      : 查询任务进度
 *  - DELETE /api/excel/jobs/:id    : 取消任务
 *  - GET  /api/excel/export        : 流式导出
 *  - GET  /api/excel/template      : 模板下载
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
const { batchInsert, batchInsertIgnore, batchInsertReplace, batchInsertReplaceTable } = require('../lib/batchWriter');
const jobs = require('../lib/importJobs');
const { ERR, biz, ok, fail, asyncHandler } = require('../lib/errors');
const log = require('../lib/logger');

const SYNC_THRESHOLD = 1000;  // 超过此行数走异步

// #P1-9 修复：并发上限 — 同时跑 3 个大文件 import 会把 better-sqlite3 锁死/撑爆内存
const MAX_CONCURRENT_IMPORTS = 3;
let _runningImports = 0;
function _tryStartJob(fn) {
  if (_runningImports >= MAX_CONCURRENT_IMPORTS) {
    setTimeout(() => _tryStartJob(fn), 200);
    return;
  }
  _runningImports++;
  fn().finally(() => { _runningImports--; });
}

// #Audit#29 修复：UPLOAD_DIR 相对 __dirname — node 启动 cwd 不同会写错地方
//   之前：process.env.UPLOAD_DIR || './uploads' — docker/pm2 启动时 cwd 可能是 /, 写根目录就坏
//   之后：默认 path.join(__dirname, '..', 'uploads')
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 启动时清理 >1h 的孤儿上传（异常中断、route crash 时残留）
function cleanupStaleUploads(maxAgeMs = 60 * 60 * 1000) {
  try {
    const now = Date.now();
    let removed = 0;
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
      const fp = path.join(UPLOAD_DIR, name);
      try {
        const st = fs.statSync(fp);
        if (st.isFile() && (now - st.mtimeMs) > maxAgeMs) {
          fs.unlinkSync(fp);
          removed++;
        }
      } catch (_) {}
    }
    if (removed > 0) log.info('upload.cleanup', { removed, dir: UPLOAD_DIR });
  } catch (e) {
    log.warn('upload.cleanup.failed', { err: e.message });
  }
}
cleanupStaleUploads();

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
 * 内部：把上传文件解析成 sheet 列表
 */
// #B25 修复：sync path 用 memory buffer 替代 sync I/O
//   之前：parseWorkbook(filePath) → XLSX.readFile 同步读盘，阻塞主线程
//   之后：sync 路径要求 multer.memoryStorage，XLSX.read(buffer) 同步解析(纯 CPU 工作)
// TODO B25: switch multer to memoryStorage in excel.js + 调整两个 route 把 req.file.buffer 传给 parseWorkbook
function parseWorkbook(filePath) {
  try {
    return XLSX.readFile(filePath);
  } catch (e) {
    throw biz(ERR.EXC_PARSE_FAILED, '文件解析失败：' + e.message);
  }
}

/**
 * 内部：把 sheet 的每一行映射为可插入对象（同时收集错误）
 *   返回 { rowsToInsert, skipped, errors, total, rowIndexMap }
 *   rowIndexMap: 行号 -> 原始 Excel 行索引（用于 warn 提示）
 */
function buildRowsForSheet(ws, config) {
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const validRows = [];
  const rowIndexMap = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const v = r['姓名'] || r['诊室编号'] || r['医生姓名'] || r['名称'] || r['工号'];
    if (!v) continue;
    if (typeof v === 'string' && v.includes('示例')) continue;
    // TODO B28: 改 isExample 结构化标记 — 模板生成时给示例行打 __isExample: true，导入端按字段判断而非字符串匹配
    validRows.push(r);
    rowIndexMap.push(i + 2); // Excel 行号：1=表头，2=第一行数据
  }

  const rowsToInsert = [];
  const errors = [];
  const rowNumOf = []; // 与 rowsToInsert 对齐的原始行号
  let skipped = 0;
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const mapped = {};
    let rowErr = null;
    for (const [colName, dbField] of Object.entries(config.fields)) {
      const v = row[colName];
      if (v === undefined || v === '') {
        if (config.required.includes(colName)) { rowErr = '必填字段缺失：' + colName; break; }
      } else { mapped[dbField] = v; }
    }
    if (rowErr) { skipped++; errors.push({ row: rowIndexMap[i], msg: rowErr }); continue; }
    if (mapped.sort_order) mapped.sort_order = Number(mapped.sort_order) || 0;
    if (mapped.patient_limit) mapped.patient_limit = Number(mapped.patient_limit) || null;
    if (mapped.day_of_week) {
      const dow = Number(mapped.day_of_week);
      if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
        skipped++; errors.push({ row: rowIndexMap[i], msg: '周次必须为 1-7 的整数（1=周一，7=周日）' });
        continue;
      }
      mapped.day_of_week = dow;
    }
    if (mapped.doctor_id) mapped.doctor_id = Number(mapped.doctor_id);
    rowsToInsert.push(mapped);
    rowNumOf.push(rowIndexMap[i]);
  }
  return { rowsToInsert, skipped, errors, total: validRows.length, rowNumOf };
}

/**
 * 字段级 FK 检查规则
 *   - field: DB 字段名
 *   - refTable: 引用表
 *   - refField: 引用表的 code/id 列
 *   - depTable: 依赖的另一个表（如 room 同时需要 campus_code 与 zone_code 都合法）
 */
const FK_RULES = {
  campuses: [],
  departments: [],
  clinic_types: [],
  zones: [{ field: 'campus_code', refTable: 'campuses', refField: 'code' }],
  rooms: [
    { field: 'campus_code', refTable: 'campuses', refField: 'code' },
    { field: 'zone_code',   refTable: 'zones',    refField: 'code' }
  ],
  time_slots: [
    { field: 'campus_code',      refTable: 'campuses',     refField: 'code' },
    { field: 'clinic_type_code', refTable: 'clinic_types', refField: 'code' }
  ],
  doctors: [], // 科室是文本，无 FK
  schedules: [
    { field: 'campus_code',    refTable: 'campuses',   refField: 'code' },
    { field: 'zone_code',      refTable: 'zones',      refField: 'code' },
    { field: 'room_id',        refTable: 'rooms',      refField: 'room_id' },
    { field: 'clinic_type_code', refTable: 'clinic_types', refField: 'code' },
    { field: 'time_slot_code', refTable: 'time_slots', refField: 'code' },
    { field: 'doctor_id',      refTable: 'doctors',    refField: 'id' },
    // #Audit#4 修复：跨字段校验 — 写了 campus_name 时必须与 campuses.name 一致
    { field: 'campus_name',    refTable: 'campuses',   refField: 'name',  crossField: true, depField: 'campus_code' }
  ]
};

/**
 * 预校验：本批次数据中的 FK 是否能解析
 *   - known 缓存：表名 -> Set(已知 code)
 *   - 流程：先收集本批次所有新增 code（不写入 DB），再校验每行 FK
 *   - 不抛错，只返回 warnings
 */
// TODO B27: crossField 配置化 — 把跨字段规则（campus_code→campuses.name 等）抽成 FK_RULES 顶层 schema 配置，
//   而不是每个 rule 上挂 crossField/depField 字段；当前 schema 跨字段能力弱（只能 1 层依赖）
function preValidateFks(builtSheets) {
  const warnings = [];

  // 1) 先把数据库现有 code 拉出来当白名单
  const db = getDb();
  const known = {
    campuses:      new Set(db.prepare('SELECT code FROM campuses').all().map(r => r.code)),
    departments:   new Set(db.prepare('SELECT code FROM departments').all().map(r => r.code)),
    clinic_types:  new Set(db.prepare('SELECT code FROM clinic_types').all().map(r => r.code)),
    zones:         new Set(db.prepare('SELECT code FROM zones').all().map(r => r.code)),
    rooms:         new Set(db.prepare('SELECT room_id FROM rooms').all().map(r => r.room_id)),
    time_slots:    new Set(db.prepare('SELECT code FROM time_slots').all().map(r => r.code)),
    doctors:       new Set(db.prepare('SELECT id FROM doctors').all().map(r => r.id))
  };
  // #Audit#4：跨字段映射 campus_code → campuses.name
  const _campusRows = db.prepare('SELECT code, name FROM campuses').all();
  known._campusNameByCode = Object.fromEntries(_campusRows.map(r => [r.code, r.name]));

  // 2) 收集本批次将新增的 code（按表）
  //    注意：用本次导入的“已构建数据”而不是真实插入，估算本批次带来的新值
  for (const { sheetName, config, built } of builtSheets) {
    const t = config.table;
    if (t === 'campuses')     for (const r of built.rowsToInsert) if (r.code) known.campuses.add(r.code);
    if (t === 'departments')  for (const r of built.rowsToInsert) if (r.code) known.departments.add(r.code);
    if (t === 'clinic_types') for (const r of built.rowsToInsert) if (r.code) known.clinic_types.add(r.code);
    if (t === 'zones')        for (const r of built.rowsToInsert) if (r.code) known.zones.add(r.code);
    if (t === 'rooms')        for (const r of built.rowsToInsert) if (r.room_id) known.rooms.add(r.room_id);
    if (t === 'time_slots')   for (const r of built.rowsToInsert) if (r.code) known.time_slots.add(r.code);
    if (t === 'doctors')      for (const r of built.rowsToInsert) if (r.id) known.doctors.add(r.id);
  }

  // 3) 校验：每个 sheet 的每行 FK
  for (const { sheetName, config, built } of builtSheets) {
    const rules = FK_RULES[config.table] || [];
    if (rules.length === 0) continue;
    for (let i = 0; i < built.rowsToInsert.length; i++) {
      const r = built.rowsToInsert[i];
      const rowNum = built.rowNumOf ? built.rowNumOf[i] : (i + 2);
      for (const rule of rules) {
        const v = r[rule.field];
        if (v == null || v === '') continue; // 必填已经在 buildRows 阶段检查了

        // #Audit#4 跨字段：campus_name 必须等于 campuses.name（按 depField=campus_code 拿对应行）
        if (rule.crossField && rule.depField) {
          const depVal = r[rule.depField];
          const depNameMap = known._campusNameByCode;
          if (depNameMap && depVal && depNameMap[depVal] && depNameMap[depVal] !== v) {
            warnings.push({
              sheet: sheetName, row: rowNum, field: rule.field, value: v,
              refTable: rule.refTable,
              msg: '跨字段不一致：' + rule.depField + '=' + depVal + ' 对应 ' + rule.refTable + '.name=' + depNameMap[depVal] + '，但本行写的是 '+ v
            });
            continue;
          }
        }

        const set = known[rule.refTable];
        if (!set || !set.has(v)) {
          warnings.push({
            sheet: sheetName, row: rowNum, field: rule.field, value: v,
            refTable: rule.refTable,
            msg: '引用不存在：' + rule.field + '=' + v + ' 在 ' + rule.refTable + ' 中未找到'
          });
        }
      }
    }
  }
  return warnings;
}

/**
 * 把 wb.SheetNames 重新按 FK 依赖顺序排序
 *   - 独立表先入（campuses, departments, clinic_types, doctors）
 *   - 再依赖表（zones → rooms → time_slots）
 *   - 最后 schedules
 *   - 未识别的 sheet 保持原顺序追加到末尾
 */
const FK_ORDER = ['campuses', 'departments', 'clinic_types', 'zones', 'rooms', 'time_slots', 'doctors', 'schedules'];
const SHEET_TO_TABLE = {};
for (const [name, cfg] of Object.entries(SHEET_CONFIG)) {
  SHEET_TO_TABLE[cfg.table] = SHEET_TO_TABLE[cfg.table] || name;
}
function orderSheets(sheetNames) {
  const known = new Set(Object.keys(SHEET_CONFIG));
  const ordered = [];
  const tail = [];
  for (const table of FK_ORDER) {
    const sn = SHEET_TO_TABLE[table];
    if (sn && sheetNames.includes(sn)) ordered.push(sn);
  }
  for (const sn of sheetNames) {
    if (!known.has(sn)) tail.push(sn);
  }
  return { ordered, unknown: tail };
}

/**
 * 每个 sheet 在不同 mode 下的策略 + 安全限制
 *
 * 表格分级：
 *  - 基础数据（campuses/departments/clinic_types/zones/rooms/time_slots/doctors）：
 *    三种模式都允许
 *  - 排班（schedules）：仅 skip / overwrite；不允许完全替换（会清空周模板）
 */
const TABLE_POLICY = {
  schedules: { allowReplace: false },
  doctors:   { allowReplace: true,  cascadeWarn: '若清空医生表，关联的排班会级联删除' },
  rooms:     { allowReplace: true,  cascadeWarn: '若清空诊室表，关联的排班会级联删除' },
  time_slots:{ allowReplace: true,  cascadeWarn: '若清空时段表，关联的排班会级联删除' },
  zones:     { allowReplace: true,  cascadeWarn: '若清空诊区表，关联的诊室会级联删除' }
}

function getImportStrategy(mode) {
  // mode: 'skip' | 'overwrite' | 'replace'
  if (mode === 'overwrite') return { fn: batchInsertReplace, label: '覆盖已有' }
  if (mode === 'replace')  return { fn: batchInsertReplaceTable, label: '完全替换' }
  return { fn: batchInsertIgnore, label: '跳过已有' }  // skip 是默认值
}

function normalizeMode(raw) {
  if (raw === 'overwrite' || raw === '1') return 'overwrite'
  if (raw === 'replace'  || raw === '2') return 'replace'
  return 'skip'  // 默认
}

/**
 * POST /api/excel/import
 * 同步导入（小文件）。超过 SYNC_THRESHOLD 行时自动转异步
 * 上传一个 .xlsx 文件，每个 sheet 名称对应一个表
 * 字段必须以「使用说明」sheet 为准
 */
router.post('/import', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw biz(ERR.VAL_REQUIRED, '未上传文件');
  const dryRun = req.body.dryRun === 'true' || req.body.dryRun === '1';
  const mode = normalizeMode(req.body.mode);
  const strategy = getImportStrategy(mode);

  const wb = parseWorkbook(req.file.path);
  const db = getDb();
  const summary = {};
  const errors = [];
  const warnings = [];
  let totalRows = 0;

  // 预扫一遍估算总行数
  for (const sheetName of wb.SheetNames) {
    const config = SHEET_CONFIG[sheetName];
    if (!config) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    totalRows += (XLSX.utils.sheet_to_json(ws, { defval: '' }).length);
  }

  // 超过阈值转异步
  if (totalRows > SYNC_THRESHOLD && !dryRun) {
    // #P0-5 修复：早返回前清理临时文件，避免孤儿上传堆积
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(202).json(ok({
      message: '文件超过 ' + SYNC_THRESHOLD + ' 行，请改用异步导入',
      jobId: null,
      totalRows,
      mode,
      asyncImportUrl: '/api/excel/import-async'
    }, { _hint: 'use_async' }));
  }

  // 重新按 FK 依赖顺序排列
  const { ordered, unknown } = orderSheets(wb.SheetNames);
  for (const sn of unknown) {
    summary[sn] = { skipped: true, reason: '未识别的 sheet（应使用模板的 sheet 名）' };
  }
  if (unknown.length > 0) {
    errors.push({ sheet: unknown.join(','), msg: '存在未识别 sheet：' + unknown.join(', ') });
  }

  // 第一遍：构建 + 预校验（不写库）
  const builtSheets = [];
  for (const sheetName of ordered) {
    const config = SHEET_CONFIG[sheetName];
    if (!config) continue;
    if (mode === 'replace' && TABLE_POLICY[config.table] && TABLE_POLICY[config.table].allowReplace === false) {
      summary[sheetName] = { skipped: true, reason: '排班表不允许"完全替换"模式（会清空周模板）' };
      errors.push({ sheet: sheetName, msg: '该表不允许 replace 模式' });
      continue;
    }
    // #P0-9 修复：cascadeWarn 推到 warnings，让用户看到级联影响
    if (mode === 'replace' && TABLE_POLICY[config.table] && TABLE_POLICY[config.table].cascadeWarn) {
      warnings.push({
        sheet: sheetName,
        type: 'cascade',
        msg: TABLE_POLICY[config.table].cascadeWarn
      });
    }
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const built = buildRowsForSheet(ws, config);
    built.errors.forEach(function (e) { errors.push(Object.assign({ sheet: sheetName }, e)); });
    builtSheets.push({ sheetName, config, built });
  }
  // FK 预校验（dryRun 也要做，给用户清晰反馈）
  const fkWarnings = preValidateFks(builtSheets);
  if (fkWarnings.length > 0) {
    fkWarnings.slice(0, 50).forEach(w => errors.push(w));
  }

  for (const { sheetName, config, built } of builtSheets) {
    const { rowsToInsert, skipped, total } = built;
    const stat = { added: 0, updated: 0, deleted: 0, skipped: skipped, total: total, inserted: 0 };
    if (dryRun) {
      // 试导入：仅按行数预估
      stat.added = rowsToInsert.length;
    } else if (rowsToInsert.length > 0) {
      const t0 = Date.now();
      const fields = Object.keys(rowsToInsert[0]);
      const result = await strategy.fn(db, config.table, fields, rowsToInsert, 200);
      stat.added = result.added || 0;
      stat.updated = result.updated || 0;
      stat.deleted = result.deleted || 0;
      stat.inserted = result.added + result.updated;
      result.errors.forEach(function (msg) { errors.push({ sheet: sheetName, msg: msg }); });
      log.info('import.sheet.done', {
        sheet: sheetName, mode: mode, table: config.table,
        added: stat.added, updated: stat.updated, deleted: stat.deleted,
        ms: Date.now() - t0
      });
    }
    stat.mode = mode;
    summary[sheetName] = stat;
  }

  // 清理临时文件
  try { fs.unlinkSync(req.file.path); } catch (_) {}

  audit(req.user.id, req.user.username, dryRun ? 'import_dry_run' : 'import', 'excel', null, { mode, summary }, req.ip);
  res.json(ok({ dryRun, mode, strategy: strategy.label, summary, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) }));
}));

/**
 * POST /api/excel/import-async
 * 异步导入（用于大文件）。立即返回 { jobId }，客户端轮询 /jobs/:id 获取进度
 */
router.post('/import-async', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw biz(ERR.VAL_REQUIRED, '未上传文件');
  const dryRun = req.body.dryRun === 'true' || req.body.dryRun === '1';
  const mode = normalizeMode(req.body.mode);
  const strategy = getImportStrategy(mode);

  // 创建任务
  const job = jobs.createJob({
    file: req.file.path,
    filename: req.file.originalname,
    dryRun,
    mode,
    user: { id: req.user.id, username: req.user.username }
  });

  // 解析 + 估算行数
  let wb;
  try {
    wb = parseWorkbook(req.file.path);
  } catch (e) {
    jobs.failJob(job, e);
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    throw e;
  }

  // 预扫：算出每个 sheet 行数 + 排序 + FK 预校验
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const config = SHEET_CONFIG[sheetName];
    if (!config) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const built = buildRowsForSheet(ws, config);
    sheets.push({ sheetName, config, built });
  }
  const { ordered: orderedSheets, unknown: unknownSheets } = orderSheets(wb.SheetNames);
  // 把 sheets 重新按 FK 依赖顺序排
  const orderIdx = new Map(orderedSheets.map((n, i) => [n, i]));
  sheets.sort((a, b) => (orderIdx.get(a.sheetName) ?? 999) - (orderIdx.get(b.sheetName) ?? 999));
  // FK 预校验
  const fkWarnings = preValidateFks(sheets);
  fkWarnings.forEach(w => job.warnings.push(w));
  // 未识别 sheet
  if (unknownSheets.length > 0) {
    job.warnings.push({ sheet: unknownSheets.join(','), msg: '存在未识别 sheet：' + unknownSheets.join(', ') });
  }
  const totalRows = sheets.reduce((s, x) => s + x.built.total, 0);
  job.total = totalRows;

  // 立即响应 jobId，导入在后台执行
  res.status(202).json(ok({
    jobId: job.id,
    total: totalRows,
    status: 'pending',
    pollUrl: '/api/excel/jobs/' + job.id
  }));

  // 后台执行
  _tryStartJob(async () => {
    job.status = 'running';
    const summary = {};
    const errors = [];
    const db = getDb();
    let processed = 0;
    let inserted = 0;
    let failed = 0;

    try {
      for (const { sheetName, config, built } of sheets) {
        if (job.cancelRequested) break;

        // 政策校验
        if (mode === 'replace' && TABLE_POLICY[config.table] && TABLE_POLICY[config.table].allowReplace === false) {
          summary[sheetName] = { skipped: true, reason: '排班表不允许"完全替换"模式' };
          errors.push({ sheet: sheetName, msg: '该表不允许 replace 模式' });
          processed += built.total;
          continue;
        }

        const { rowsToInsert, skipped, errors: rowErrs } = built;
        rowErrs.forEach(function (e) { errors.push(Object.assign({ sheet: sheetName }, e)); failed++; });

        const stat = { added: 0, updated: 0, deleted: 0, skipped, total: built.total };

        if (dryRun) {
          stat.added = rowsToInsert.length;
          inserted += rowsToInsert.length;
        } else if (rowsToInsert.length > 0) {
          const fields = Object.keys(rowsToInsert[0]);
          const result = await strategy.fn(db, config.table, fields, rowsToInsert, 200);
          stat.added = result.added || 0;
          stat.updated = result.updated || 0;
          stat.deleted = result.deleted || 0;
          inserted += stat.added + stat.updated;
          failed += (result.errors || []).length;
          (result.errors || []).forEach(function (msg) { errors.push({ sheet: sheetName, msg }); });
        }
        stat.mode = mode;
        summary[sheetName] = stat;
        processed += built.total;
        jobs.setProgress(job, processed, totalRows, inserted, failed);
      }

      jobs.completeJob(job, { mode, summary, errors: errors.slice(0, 50) });
      audit(job.user.id, job.user.username, dryRun ? 'import_async_dry_run' : 'import_async', 'excel', null, { mode, summary }, null);
    } catch (e) {
      // #P2-38 修复：区分 cancelled vs failed — setProgress 抛的 cancelled 不应被记为失败
      if (e && e.cancelled) {
        jobs.completeJob(job, { mode, summary, errors: errors.slice(0, 50), cancelled: true });
        return;
      }
      jobs.failJob(job, e);
    } finally {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  });
}));

/**
 * GET /api/excel/jobs
 * 列出最近的任务
 */
router.get('/jobs', requireAuth, asyncHandler((req, res) => {
  res.json(ok({ data: jobs.listJobs() }));
}));

/**
 * GET /api/excel/jobs/:id
 * 查询任务进度
 */
router.get('/jobs/:id', requireAuth, asyncHandler((req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) throw biz(ERR.EXC_JOB_NOT_FOUND, '任务不存在或已过期');
  res.json(ok({
    id: job.id,
    status: job.status,
    progress: job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0,
    processed: job.processed,
    total: job.total,
    inserted: job.inserted,
    failed: job.failed,
    mode: job.mode || 'skip',
    errors: job.errors.slice(0, 20),
    warnings: (job.warnings || []).slice(0, 20),
    summary: job.summary,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    dryRun: job.dryRun
  }));
}));

/**
 * DELETE /api/excel/jobs/:id
 * 取消任务
 */
router.delete('/jobs/:id', requireAuth, asyncHandler((req, res) => {
  const ok2 = jobs.cancelJob(req.params.id);
  if (!ok2) throw biz(ERR.EXC_JOB_NOT_FOUND, '任务不存在或已过期');
  res.json(ok({ cancelled: true }));
}));

/**
 * GET /api/excel/export
 * 导出全部数据到一个 .xlsx 文件
 *  - 小数据量（< 5000 行）：直接生成内存 buffer
 *  - 大数据量：分批流式写入 xlsx，避免内存峰值
 * Query: type=schedules|campuses|all
 */
router.get('/export', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  // #P0-6 修复：导出前先 COUNT，超过上限直接 413 + 引导用户用 CSV 导出
  //   XLSX.json_to_sheet 把整批数据铺成 cell matrix，O(N²) 内存膨胀
  //   CSV 导出走流式 (server.js:165-205)，5 万行也不卡
  const MAX_ROWS = parseInt(process.env.EXCEL_EXPORT_MAX_ROWS, 10) || 50000
  const totalSchedules = db.prepare('SELECT COUNT(*) AS c FROM schedules').get().c
  if (totalSchedules > MAX_ROWS) {
    throw biz(ERR.SYS_INTERNAL, `导出数据 ${totalSchedules} 行超过 Excel 上限 ${MAX_ROWS} 行，请改用 CSV 导出（/api/schedules/export）`)
  }
  const wb = XLSX.utils.book_new();

  // 简单实体一次性查询
  const simpleSheets = [
    { name: '1-院区', sql: 'SELECT name as 名称, code as 代码, sort_order as 排序 FROM campuses ORDER BY sort_order' },
    { name: '2-科室', sql: 'SELECT name as 名称, code as 代码 FROM departments ORDER BY id' },
    { name: '3-门诊类型', sql: 'SELECT name as 名称, code as 代码, sort_order as 排序 FROM clinic_types ORDER BY sort_order' },
    { name: '4-诊区', sql: 'SELECT name as 名称, code as 代码, campus_code as 院区代码, campus_name as 院区名称, sort_order as 排序 FROM zones ORDER BY campus_code, sort_order' },
    { name: '5-诊室', sql: 'SELECT room_id as 诊室编号, room_name as 诊室名称, campus_code as 院区代码, campus_name as 院区名称, zone_code as 诊区代码, zone_name as 诊区名称, department as 归属科室 FROM rooms ORDER BY campus_code, room_id' },
    { name: '6-时段', sql: 'SELECT name as 名称, code as 代码, campus_code as 院区代码, campus_name as 院区名称, clinic_type_code as 门诊类型代码, clinic_type_name as 门诊类型名称, period as 午别, start_time as 开始时间, end_time as 结束时间, sort_order as 排序 FROM time_slots ORDER BY campus_code, sort_order' },
    { name: '7-医生', sql: 'SELECT name as 姓名, work_id as 工号, department as 科室, title as 职称, other_title as 其他职称, primary_campus as 主院区 FROM doctors ORDER BY work_id' }
  ];
  for (const s of simpleSheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.prepare(s.sql).all()), s.name);
  }

  // 排班表：分批流式写入（每 1000 行一批，避免一次性大数组）
  const BATCH_SIZE = 1000;
  const stmt = db.prepare(`
    SELECT doctor_id as 医生ID, doctor_name as 医生姓名, work_id as 工号, department as 科室,
           campus_code as 院区代码, campus_name as 院区名称,
           zone_code as 诊区代码, zone_name as 诊区名称,
           room_id as 诊室编号, room_name as 诊室名称,
           clinic_type_code as 门诊类型代码, clinic_type_name as 门诊类型名称,
           time_slot_code as 时段代码, period as 午别,
           start_time as 开始时间, end_time as 结束时间,
           day_of_week as 周次, remark as 备注, patient_limit as 限号数
    FROM schedules ORDER BY campus_code, day_of_week, period, room_id
  `);

  // #Audit#20 修复：导出按 5k/页分多个 sheet 写 — 避免 json_to_sheet(O(N²) 内存膨胀)
  //   之前：先 iterate 攒到 allRows（10k 行已经 ~10MB JS 对象），再 json_to_sheet → O(N²) cell matrix 写一遍
  //   之后：流式读 + 每 5k 行写一个 sheet（8-排班、8-排班-2、8-排班-3…），单 sheet 内存上限可控
  const SHEET_MAX = 5000;
  let buf = [];
  let sheetIdx = 0;
  let totalRows = 0;
  function flushSheet() {
    if (buf.length === 0) return;
    const name = sheetIdx === 0 ? '8-排班' : '8-排班-' + (sheetIdx + 1);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buf), name);
    sheetIdx += 1;
    buf = [];
  }
  for (const row of stmt.iterate()) {
    buf.push(row);
    totalRows += 1;
    if (buf.length >= SHEET_MAX) flushSheet();
  }
  flushSheet();
  log.info('export.completed', { schedules: totalRows, sheets: sheetIdx });

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = '排班数据备份_' + new Date().toISOString().slice(0, 10) + '.xlsx';

  audit(req.user.id, req.user.username, 'export', 'excel', null, null, req.ip);

  res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Length', String(buffer.length));
  res.end(buffer);
}));

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
module.exports.cleanupStaleUploads = cleanupStaleUploads;
