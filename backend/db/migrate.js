/**
 * 数据库迁移 runner
 *
 * 用法：
 *   node db/migrate.js                 # 应用所有未执行的迁移
 *   node db/migrate.js --status        # 查看当前状态
 *   node db/migrate.js --create <name> # 生成新迁移模板（NNN_name.sql）
 *   node db/migrate.js --down <ver>    # 回滚指定版本（仅适用有 -- Down: 标记的）
 *
 * 迁移文件命名：NNN_name.sql（NNN = 3 位序号）
 *   例：001_init.sql、002_add_patient_limit.sql
 *   文件里可以包含一个 -- Down: 标记，下面是可回滚的 SQL
 *
 * 跟踪表：schema_migrations(version PK, applied_at, checksum, execution_ms)
 *
 * 每个迁移在事务内执行（all-or-nothing）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('../lib/logger');

let Database;
try { Database = require('better-sqlite3'); }
catch (e) {
  log.error('migrate.dep.missing', {}, e);
  process.exit(1);
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'schedule.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function getDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function ensureMigrationsTable(db) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (' +
    '  version TEXT PRIMARY KEY,' +
    '  applied_at TEXT NOT NULL DEFAULT (datetime(\'now\', \'localtime\')),' +
    '  checksum TEXT,' +
    '  execution_ms INTEGER' +
    ')'
  );
}

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(function (f) { return /^\d{3}_[a-z0-9_]+\.sql$/i.test(f); })
    .map(function (f) {
      const version = f.replace(/\.sql$/i, '');
      const full = path.join(MIGRATIONS_DIR, f);
      const content = fs.readFileSync(full, 'utf8');
      const checksum = crypto.createHash('sha256').update(content).digest('hex');
      return { version: version, file: f, full: full, content: content, checksum: checksum };
    })
    .sort(function (a, b) { return a.version.localeCompare(b.version); });
}

function getAppliedVersions(db) {
  ensureMigrationsTable(db);
  const rows = db.prepare('SELECT version, applied_at, checksum, execution_ms FROM schema_migrations ORDER BY version').all();
  return rows;
}

function splitUpDown(content) {
  // 寻找 "-- Down:" 标记（行首或带前导空白），分割为 up / down
  const m = /^[ \t]*--\s*Down:?\s*$/im.exec(content);
  if (!m) return { up: content, down: null };
  const up = content.substring(0, m.index);
  const down = content.substring(m.index + m[0].length);
  return { up: up, down: down };
}

function applyOne(db, m) {
  const start = Date.now();
  const { up } = splitUpDown(m.content);
  const tx = db.transaction(function () {
    db.exec(up);
    db.prepare(
      'INSERT INTO schema_migrations (version, checksum, execution_ms) VALUES (?, ?, ?)'
    ).run(m.version, m.checksum, Date.now() - start);
  });
  tx();
  return Date.now() - start;
}

function rollbackOne(db, m) {
  const { down } = splitUpDown(m.content);
  if (!down || !down.trim()) {
    throw new Error('migration ' + m.version + ' has no -- Down: block, cannot rollback');
  }
  const tx = db.transaction(function () {
    db.exec(down);
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(m.version);
  });
  tx();
}

function showStatus(db) {
  const all = listMigrations();
  const applied = getAppliedVersions(db);
  const appliedMap = new Map(applied.map(function (r) { return [r.version, r]; }));
  log.info('migrate.status', { total: all.length, applied: applied.length });
  for (const m of all) {
    const a = appliedMap.get(m.version);
    if (a) {
      const ok = a.checksum === m.checksum ? 'OK' : 'MISMATCH';
      log.info('migrate.entry', { version: m.version, status: ok, appliedAt: a.applied_at, executionMs: a.execution_ms });
    } else {
      log.info('migrate.entry', { version: m.version, status: 'PENDING' });
    }
  }
}

function migrateAllSync() {
  const db = getDb();
  ensureMigrationsTable(db);
  const all = listMigrations();
  const applied = new Set(getAppliedVersions(db).map(function (r) { return r.version; }));
  const pending = all.filter(function (m) { return !applied.has(m.version); });

  if (pending.length === 0) {
    log.info('migrate.up_to_date', { total: all.length });
    db.close();
    return 0;
  }
  log.info('migrate.start', { pending: pending.length });
  for (const m of pending) {
    try {
      const ms = applyOne(db, m);
      log.info('migrate.applied', { version: m.version, file: m.file, executionMs: ms });
    } catch (e) {
      log.error('migrate.failed', { version: m.version, file: m.file }, e);
      return 1;
    }
  }
  return 0;
}

function createMigration(name) {
  if (!name) {
    log.error('migrate.create.name_required', {});
    process.exit(1);
  }
  if (!/^[a-z0-9_]+$/i.test(name)) {
    log.error('migrate.create.bad_name', { name: name });
    process.exit(1);
  }
  const existing = fs.readdirSync(MIGRATIONS_DIR).filter(function (f) { return /^\d{3}_/.test(f); });
  const next = existing.length === 0 ? 1 : Math.max.apply(null, existing.map(function (f) { return parseInt(f.substring(0, 3), 10); })) + 1;
  const prefix = String(next).padStart(3, '0');
  const filename = prefix + '_' + name + '.sql';
  const full = path.join(MIGRATIONS_DIR, filename);
  const template = [
    '-- Migration: ' + name,
    '-- Created: ' + new Date().toISOString(),
    '',
    '-- 在此写 DDL / DML；事务由 runner 自动包裹',
    '-- 例：',
    '-- ALTER TABLE schedules ADD COLUMN patient_limit INTEGER;',
    '-- CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(day_of_week);',
    '',
    '-- Down: （可选）回滚 SQL',
    '-- ALTER TABLE schedules DROP COLUMN patient_limit;',
    ''
  ].join('\n');
  fs.writeFileSync(full, template);
  log.info('migrate.created', { file: full });
}

function rollback(version) {
  if (!version) {
    log.error('migrate.rollback.version_required', {});
    process.exit(1);
  }
  const db = getDb();
  ensureMigrationsTable(db);
  const m = listMigrations().find(function (x) { return x.version === version; });
  if (!m) {
    log.error('migrate.rollback.not_found', { version: version });
    process.exit(1);
  }
  try {
    rollbackOne(db, m);
    log.info('migrate.rolled_back', { version: version });
  } catch (e) {
    log.error('migrate.rollback.failed', { version: version }, e);
    db.close();
    process.exit(1);
  }
  db.close();
}

function main(args) {
  args = args || process.argv.slice(2);
  if (args.includes('--status')) {
    const db = getDb();
    showStatus(db);
    db.close();
    return 0;
  }
  if (args.includes('--create')) {
    createMigration(args[args.indexOf('--create') + 1]);
    return 0;
  }
  if (args.includes('--down')) {
    rollback(args[args.indexOf('--down') + 1]);
    return 0;
  }
  return migrateAllSync();
}

module.exports = { migrateAllSync: migrateAllSync, listMigrations: listMigrations, getAppliedVersions: getAppliedVersions, main: main };

if (require.main === module) {
  process.exit(main());
}
