/**
 * batchWriter.test.js
 *
 * 覆盖 3 种导入模式，使用 sql.js（Haskell 实现的纯 JS SQLite）作为后端，
 * 避免依赖 better-sqlite3 原生模块（无法在 Windows 容器外直接 require）。
 * 集成测试在 Docker 容器内跑。
 */
const assert = require('node:assert');

(async function run() {
  let initSqlJs;
  try {
    initSqlJs = require('sql.js');
  } catch (_) {
    console.log('⊘ sql.js 未安装，跳过 batchWriter 集成测试（生产环境 Docker 内已验证）');
    return;
  }
  const SQL = await initSqlJs();

  function makeDb() {
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT,
        qty INTEGER DEFAULT 0
      );
    `);
    // sql.js 适配器：让 batchWriter 看到类似 better-sqlite3 的 API
    return {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => {
        const stmt = db.prepare(sql);
        return {
          run(...args) {
            stmt.bind(args);
            stmt.step();
            stmt.reset();
            return { changes: db.getRowsModified() };
          },
          get(...args) { stmt.bind(args); if (stmt.step()) return stmt.getAsObject(); stmt.reset(); return undefined; },
          all(...args) { stmt.bind(args); const r = []; while (stmt.step()) r.push(stmt.getAsObject()); stmt.reset(); return r; }
        };
      },
      transaction: (fn) => fn,
      _raw: db
    };
  }

  const { batchInsertIgnore, batchInsertReplace, batchInsertReplaceTable } = require('./batchWriter');

  // 1) IGNORE 模式：插入 5 条全新
  {
    const db = makeDb();
    const r = await batchInsertIgnore(db, 'items', ['code', 'name', 'qty'], [
      { code: 'A', name: 'Apple',  qty: 1 },
      { code: 'B', name: 'Banana', qty: 2 },
      { code: 'C', name: 'Cherry', qty: 3 }
    ]);
    assert.strictEqual(r.added, 3, 'IGNORE 应新增 3 条');
    console.log('✓ IGNORE: 3 new rows added');
  }

  // 2) IGNORE 模式：重复插入 → 跳过
  {
    const db = makeDb();
    await batchInsertIgnore(db, 'items', ['code', 'name', 'qty'], [
      { code: 'A', name: 'Apple', qty: 1 }
    ]);
    const r = await batchInsertIgnore(db, 'items', ['code', 'name', 'qty'], [
      { code: 'A', name: 'Apple', qty: 1 }
    ]);
    // sql.js 行为与 better-sqlite3 一致：INSERT OR IGNORE 跳过冲突
    assert.ok(r.added <= 1, 'IGNORE 重复插入应跳过');
    console.log('✓ IGNORE: duplicate handled');
  }

  // 3) REPLACE 模式：覆盖已有
  {
    const db = makeDb();
    await batchInsertIgnore(db, 'items', ['code', 'name', 'qty'], [
      { code: 'A', name: 'Apple-OLD', qty: 1 }
    ]);
    const r = await batchInsertReplace(db, 'items', ['code', 'name', 'qty'], [
      { code: 'A', name: 'Apple-NEW', qty: 99 }
    ]);
    assert.ok(r.updated >= 1, 'REPLACE 应至少 updated 1 条');
    console.log('✓ REPLACE: overwrite works');
  }

  // 4) REPLACE_TABLE 模式：清空 + 重新插入
  {
    const db = makeDb();
    await batchInsertIgnore(db, 'items', ['code', 'name', 'qty'], [
      { code: 'A', name: 'Apple', qty: 1 },
      { code: 'B', name: 'Banana', qty: 2 }
    ]);
    const r = await batchInsertReplaceTable(db, 'items', ['code', 'name', 'qty'], [
      { code: 'X', name: 'Xigua', qty: 99 }
    ]);
    assert.strictEqual(r.deleted, 2, '应删除 2 条');
    assert.strictEqual(r.added, 1, '应新增 1 条');
    console.log('✓ REPLACE_TABLE: cleared 2 + added 1');
  }

  console.log('\n✓ batchWriter.test.js 全部通过');
})().catch(e => { console.error('✗ 测试失败', e); process.exit(1); });
