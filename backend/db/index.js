/**
 * SQLite 数据库初始化
 *   - getDb() 打开单例连接（WAL + 外键）
 *   - initDb() 串行执行：应用迁移 + 写入默认管理员
 *
 * Schema 版本管理：见 db/migrate.js 和 db/migrations/
 * 历史：本文件原本内嵌 CREATE TABLE，2026-06 改为迁移系统
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const log = require('../lib/logger');
const migrate = require('./migrate');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'schedule.db');

let db = null;

function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * 初始化数据库：迁移 + 默认账号
 */
async function initDb() {
  // 1) 打开连接（必须在迁移前，否则 schema_migrations 表无法创建）
  const database = getDb();
  // 2) 应用所有 pending 迁移
  const rc = migrate.migrateAllSync();
  if (rc !== 0) throw new Error('migration failed, see logs above');
  // 3) #P0-1 修复：默认管理员账号必须显式配置 ADMIN_USERNAME + ADMIN_PASSWORD
  //   - 之前的 fallback `'admin' / 'admin123'` 会让部署时漏配的环境也能启动 + 自动建默认账号
  //   - 现在缺配直接 exit(78)，与 JWT_SECRET 强校验同等待遇
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminUser || !adminPass) {
    console.error('')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('[db/index.js] 启动失败：缺少 ADMIN_USERNAME 或 ADMIN_PASSWORD')
    console.error('  系统不允许使用默认账号密码，避免部署时漏配而被默认账号登录')
    console.error('  请在 .env 中配置：')
    console.error('    ADMIN_USERNAME=<用户名>')
    console.error('    ADMIN_PASSWORD=<强密码，建议 ≥12 位>')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('')
    process.exit(78)
  }
  if (adminPass.length < 8) {
    console.error('[db/index.js] ADMIN_PASSWORD 长度不足 8 位，请设置强密码（建议 ≥12 位）')
    process.exit(78)
  }
  const exists = database.prepare('SELECT id FROM users WHERE username = ?').get(adminUser);
  if (!exists) {
    // #P1-1 修复：bcrypt cost 10 → 12（2024+ 硬件 < 300ms 仍可接受，密码学强度提升 4 倍）
    const hash = await bcrypt.hash(adminPass, 12);
    database.prepare(
      "INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, 'admin')"
    ).run(adminUser, hash, '系统管理员');
    log.info('db.admin.seeded', { username: adminUser, hint: 'change after first login' });
  }
  log.info('db.init.done', { path: DB_PATH });
}

module.exports = { initDb, getDb, DB_PATH };
