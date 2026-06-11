/**
 * 备份完整性校验
 *
 * 用法：node scripts/verify-backup.js [--latest] [--file=NAME] [--json]
 *   --latest  只校验最近一份
 *   --file=NAME  只校验指定文件
 *   --json    输出 JSON 格式（便于监控接入）
 *
 * 检查项：
 *   1. 文件大小 > 0
 *   2. SHA-256 与 .meta.json 一致
 *   3. better-sqlite3 可打开（数据库结构未损坏）
 *   4. 含有所需的核心表
 *   5. 用户表非空（说明不是被清空的）
 *
 * 退出码：
 *   0 全部通过
 *   1 有备份失败
 *   2 没有任何备份
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let Database;
try {
  Database = require('better-sqlite3');
} catch (_) {
  console.error('[verify] better-sqlite3 not installed; install with: npm install better-sqlite3');
  process.exit(2);
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'schedule.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const REQUIRED_TABLES = (process.env.BACKUP_REQUIRED_TABLES || 'users,schedules,rooms,doctors,time_slots')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

const ARGS = process.argv.slice(2);
const JSON_OUT = ARGS.includes('--json');
const LATEST_ONLY = ARGS.includes('--latest');
const FILE_ARG = ARGS.find(function (a) { return a.startsWith('--file='); });

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function (f) { return /^schedule-\d{8}-\d{6}\.db$/.test(f); })
    .map(function (f) { return { name: f, path: path.join(dir, f) }; })
    .sort();
}

function verifyOne(file) {
  const result = { name: file.name, ok: true, checks: {} };
  const metaPath = file.path + '.meta.json';
  let meta = null;
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) {}
  }

  // 1) 存在 + 非空
  const stat = fs.statSync(file.path);
  result.checks.sizeOk = stat.size > 0;
  if (!result.checks.sizeOk) result.ok = false;
  result.sizeBytes = stat.size;

  // 2) SHA-256
  try {
    const h = sha256(file.path);
    result.checks.hashOk = meta ? (h === meta.sha256) : null;
    if (result.checks.hashOk === false) result.ok = false;
    result.sha256 = h.slice(0, 12) + '...';
  } catch (e) {
    result.checks.hashOk = false;
    result.ok = false;
  }

  // 3) 可被 sqlite3 打开
  let db = null;
  try {
    db = new Database(file.path, { readonly: true, fileMustExist: true });
    result.checks.openOk = true;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(function (r) { return r.name; });
    result.tables = tables;
    // 4) 核心表存在
    const missing = REQUIRED_TABLES.filter(function (t) { return tables.indexOf(t) < 0; });
    result.checks.tablesOk = missing.length === 0;
    if (missing.length) result.missingTables = missing;
    if (!result.checks.tablesOk) result.ok = false;
    // 5) 用户表行数
    if (tables.indexOf('users') >= 0) {
      const n = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
      result.usersCount = n;
      result.checks.usersNotEmpty = n > 0;
      if (!result.checks.usersNotEmpty) result.ok = false;
    }
  } catch (e) {
    result.checks.openOk = false;
    result.openError = e.message;
    result.ok = false;
  } finally {
    if (db) try { db.close(); } catch (_) {}
  }

  return result;
}

function main() {
  if (!fs.existsSync(BACKUP_DIR)) {
    const out = { error: 'BACKUP_DIR not found: ' + BACKUP_DIR, backups: [] };
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
    else console.error('[verify] ' + out.error);
    process.exit(2);
  }
  let backups = listBackups(BACKUP_DIR);
  if (backups.length === 0) {
    const out = { error: 'no backups found in ' + BACKUP_DIR, backups: [] };
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
    else console.log('[verify] no backups in ' + BACKUP_DIR);
    process.exit(2);
  }
  if (FILE_ARG) {
    const target = FILE_ARG.split('=')[1];
    backups = backups.filter(function (b) { return b.name === target; });
    if (backups.length === 0) {
      console.error('[verify] file not found: ' + target);
      process.exit(1);
    }
  } else if (LATEST_ONLY) {
    backups = [backups[backups.length - 1]];
  }

  const results = backups.map(verifyOne);
  const passCount = results.filter(function (r) { return r.ok; }).length;
  const failCount = results.length - passCount;

  if (JSON_OUT) {
    console.log(JSON.stringify({ summary: { total: results.length, pass: passCount, fail: failCount }, backups: results }, null, 2));
  } else {
    for (const r of results) {
      const tag = r.ok ? 'OK' : 'FAIL';
      const flags = Object.keys(r.checks).map(function (k) { return k + '=' + r.checks[k]; }).join(' ');
      console.log('[' + tag + '] ' + r.name + ' size=' + r.sizeBytes + ' sha256=' + (r.sha256 || '?') + ' ' + flags);
      if (r.openError) console.log('       open error: ' + r.openError);
      if (r.missingTables) console.log('       missing tables: ' + r.missingTables.join(', '));
    }
    console.log('[verify] total=' + results.length + ' pass=' + passCount + ' fail=' + failCount);
  }
  process.exit(failCount > 0 ? 1 : 0);
}

main();
