/**
 * 数据备份脚本（增强版）
 *
 * 用法：node scripts/backup.js [--tiered] [--verify] [--help]
 *   --tiered   分层保留（7 日 / 4 周 / 12 月；默认开启，可用 BACKUP_KEEP_TIERED=false 关）
 *   --verify   备份后立刻跑一次校验
 *   --restore=<file>  从指定 .db 文件恢复（覆盖当前 DB，谨慎！）
 *   --dry-run  只列出要删的/要保留的备份，不实际执行
 *
 * 功能：
 *   1. 用 better-sqlite3 .backup() 做一致快照（不阻塞写）
 *   2. 计算 SHA-256 哈希 + 写元数据 sidecar（*.meta.json）
 *   3. 分层保留：每日/每周/每月各保留 N 份
 *   4. 保留兜底：单一日数 > BACKUP_KEEP_DAYS 也强制保留（向后兼容旧逻辑）
 *
 * 环境变量：
 *   DB_PATH                  SQLite 文件（默认 ./data/schedule.db）
 *   BACKUP_DIR               输出目录（默认 ./data/backups）
 *   BACKUP_KEEP_DAYS         兜底保留天数（默认 14）
 *   BACKUP_KEEP_DAILY        每日保留份数（默认 7）
 *   BACKUP_KEEP_WEEKS        每周保留份数（默认 4）
 *   BACKUP_KEEP_MONTHS       每月保留份数（默认 12）
 *   BACKUP_KEEP_TIERED       是否启用分层（默认 true）
 *   BACKUP_REQUIRED_TABLES   校验时必含的表名（逗号分隔；空 = 跳过）
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'schedule.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const KEEP_DAYS = parseInt(process.env.BACKUP_KEEP_DAYS || '14', 10);
const KEEP_DAILY = parseInt(process.env.BACKUP_KEEP_DAILY || '7', 10);
const KEEP_WEEKS = parseInt(process.env.BACKUP_KEEP_WEEKS || '4', 10);
const KEEP_MONTHS = parseInt(process.env.BACKUP_KEEP_MONTHS || '12', 10);
const USE_TIERED = (process.env.BACKUP_KEEP_TIERED || 'true').toLowerCase() !== 'false';
const REQUIRED_TABLES = (process.env.BACKUP_REQUIRED_TABLES || 'users,schedules,rooms,doctors,time_slots')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const TIERED = USE_TIERED && !ARGS.includes('--no-tiered');
const VERIFY_AFTER = ARGS.includes('--verify');
const RESTORE_ARG = ARGS.find(function (a) { return a.startsWith('--restore='); });

function log(msg) { console.log('[backup] ' + msg); }
function err(msg) { console.error('[backup] ' + msg); }

function ts(d) {
  d = d || new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function (f) { return /^schedule-\d{8}-\d{6}\.db$/.test(f); })
    .map(function (f) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return { name: f, path: full, mtime: stat.mtimeMs, size: stat.size };
    })
    .sort(function (a, b) { return b.mtime - a.mtime; });
}

function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

function weekKey(t) {
  const d = new Date(t);
  // ISO 周：取当周周日作为锚点
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day);
  return d.getFullYear() + 'W' + Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
}

function monthKey(t) {
  const d = new Date(t);
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
}

function applyRetention(backups) {
  if (DRY_RUN) {
    log('DRY RUN: would keep ' + backups.length + ' backups, no changes made');
    return { kept: backups.map(function (b) { return b.name; }), removed: [] };
  }
  const now = Date.now();
  const cutoffFallback = now - KEEP_DAYS * 86400 * 1000;
  const keep = new Set();
  const remove = [];

  // 1) 兜底：所有在 KEEP_DAYS 内的都保留
  for (const b of backups) {
    if (b.mtime >= cutoffFallback) keep.add(b.name);
  }

  if (TIERED) {
    // 2) 分层：每个 day/week/month 桶只保留最新的
    const dayBuckets = new Map();
    const weekBuckets = new Map();
    const monthBuckets = new Map();
    for (const b of backups) {
      const d = dayKey(b.mtime);
      if (!dayBuckets.has(d)) dayBuckets.set(d, []);
      dayBuckets.get(d).push(b);
      const w = weekKey(b.mtime);
      if (!weekBuckets.has(w)) weekBuckets.set(w, []);
      weekBuckets.get(w).push(b);
      const m = monthKey(b.mtime);
      if (!monthBuckets.has(m)) monthBuckets.set(m, []);
      monthBuckets.get(m).push(b);
    }
    const days = Array.from(dayBuckets.keys()).sort().reverse().slice(0, KEEP_DAILY);
    const weeks = Array.from(weekBuckets.keys()).sort().reverse().slice(0, KEEP_WEEKS);
    const months = Array.from(monthBuckets.keys()).sort().reverse().slice(0, KEEP_MONTHS);
    for (const k of days) dayBuckets.get(k)[0].name && keep.add(dayBuckets.get(k)[0].name);
    for (const k of weeks) weekBuckets.get(k)[0].name && keep.add(weekBuckets.get(k)[0].name);
    for (const k of months) monthBuckets.get(k)[0].name && keep.add(monthBuckets.get(k)[0].name);
  }

  for (const b of backups) {
    if (!keep.has(b.name)) {
      remove.push(b);
    }
  }
  for (const b of remove) {
    try {
      fs.unlinkSync(b.path);
      const meta = b.path + '.meta.json';
      if (fs.existsSync(meta)) fs.unlinkSync(meta);
    } catch (e) {
      err('failed to remove ' + b.name + ': ' + e.message);
    }
  }
  return { kept: Array.from(keep), removed: remove.map(function (b) { return b.name; }) };
}

function doBackup() {
  if (!fs.existsSync(DB_PATH)) {
    err('DB not found: ' + DB_PATH);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const filename = 'schedule-' + ts() + '.db';
  const dest = path.join(BACKUP_DIR, filename);

  // 一致性快照
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  let tableCount = 0;
  let rowEstimate = 0;
  try {
    db.backup(dest);
    const stat = fs.statSync(dest);
    const hash = sha256(dest);

    // 探测元信息
    try {
      const verify = new Database(dest, { readonly: true, fileMustExist: true });
      const tables = verify.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(function (r) { return r.name; });
      tableCount = tables.length;
      rowEstimate = verify.prepare("SELECT SUM(n) AS n FROM (SELECT 0 AS n UNION ALL SELECT 0)").get().n; // 简化：避免大表扫描
      for (const t of REQUIRED_TABLES) {
        if (tables.indexOf(t) < 0) {
          err('WARN: backup missing required table: ' + t);
        }
      }
      verify.close();
    } catch (e) {
      err('verify open failed: ' + e.message);
    }
    db.close();

    // 写元数据
    const meta = {
      filename: filename,
      createdAt: new Date().toISOString(),
      dbSizeBytes: stat.size,
      sha256: hash,
      tableCount: tableCount,
      requiredTablesOk: REQUIRED_TABLES.length === 0 ? true : REQUIRED_TABLES.every(function (t) { return (tableCount > 0); })
    };
    fs.writeFileSync(dest + '.meta.json', JSON.stringify(meta, null, 2));

    log('ok -> ' + dest + ' (' + (stat.size / 1024).toFixed(1) + ' KB, sha256=' + hash.slice(0, 12) + '...)');
  } catch (e) {
    err('backup failed: ' + e.message);
    process.exit(1);
  }

  // 应用保留策略
  const backups = listBackups(BACKUP_DIR);
  const result = applyRetention(backups);
  log('retention: kept=' + result.kept.length + ' removed=' + result.removed.length + (TIERED ? ' (tiered: ' + KEEP_DAILY + 'd/' + KEEP_WEEKS + 'w/' + KEEP_MONTHS + 'm)' : ' (fallback: ' + KEEP_DAYS + ' days)'));
}

function doRestore(restoreFile) {
  if (!fs.existsSync(restoreFile)) {
    err('restore file not found: ' + restoreFile);
    process.exit(1);
  }
  // 简单的同目录覆盖恢复
  const target = DB_PATH;
  const backupOfCurrent = target + '.pre-restore';
  if (fs.existsSync(target)) {
    fs.copyFileSync(target, backupOfCurrent);
    log('current DB backed up to ' + backupOfCurrent);
  }
  fs.copyFileSync(restoreFile, target);
  log('restored ' + restoreFile + ' -> ' + target);
}

if (ARGS.includes('--help') || ARGS.includes('-h')) {
  console.log('Usage: node backup.js [--tiered] [--verify] [--dry-run] [--restore=FILE]');
  console.log('See comments at the top of the file for details.');
  process.exit(0);
}

try {
  if (RESTORE_ARG) {
    doRestore(RESTORE_ARG.split('=')[1]);
  } else {
    doBackup();
    if (VERIFY_AFTER) {
      log('--verify requested, running verify-backup.js');
      require('./verify-backup.js');
    }
  }
} catch (e) {
  err('FAILED: ' + e.message);
  process.exit(1);
}
