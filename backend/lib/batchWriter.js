/**
 * 批量写入 SQLite 工具
 *
 * 三种模式（解决"导入是覆盖还是增量"的根本问题）：
 *
 *   batchInsertIgnore(db, table, fields, rows, batchSize, onProgress)
 *     - INSERT OR IGNORE：跳过已存在（按唯一键）
 *     - 返回 { added, skipped }
 *     - 默认安全模式，适合"补几条新数据"
 *
 *   batchInsertReplace(db, table, fields, rows, batchSize, onProgress)
 *     - INSERT OR REPLACE：存在则覆盖
 *     - 返回 { added, updated, skipped? }  ← updated 来自 changes() 但无法精确定位
 *     - 适合"模板改了基础数据想同步过来"
 *
 *   batchInsertReplaceTable(db, table, fields, rows, batchSize, onProgress)
 *     - 整表清空后再 INSERT（事务内完成：DELETE + INSERT）
 *     - 返回 { added, deleted, reinserted }
 *     - 适合"完全重新初始化某个实体"（如：重新加载时段定义）
 *     - ⚠️ 危险：会破坏外键引用，调用方需自行处理依赖
 *
 * 通用特性：
 *   - 每 200 行一个事务（默认），提升性能
 *   - 整批失败自动退化到逐行（保证部分行能进）
 *   - 进度回调（可选）
 *   - 错误聚合（不中断）
 */
const BATCH_DEFAULT = 200;

const STRATEGIES = {
  // INSERT OR IGNORE：跳过冲突，返回 0
  ignore: {
    sql: 'INSERT OR IGNORE INTO {table} ({fields}) VALUES {rows}',
    countFn: function (info, row) { return info.changes > 0 ? 'added' : 'skipped' }
  },
  // INSERT OR REPLACE：覆盖冲突
  replace: {
    sql: 'INSERT OR REPLACE INTO {table} ({fields}) VALUES {rows}',
    countFn: function (info, row) {
      // better-sqlite3 的 changes() 在 OR REPLACE 时返回 1（不论新增或覆盖）
      // 无法严格区分 added/updated，但能算出总 affected
      return 'updated'
    }
  }
};

/**
 * INSERT OR IGNORE 模式：跳过已存在
 * @returns {Promise<{added:number, skipped:number, errors:string[]}>}
 */
async function batchInsertIgnore(db, table, fields, rows, batchSize, onProgress) {
  return runBatched(db, table, fields, rows, batchSize, onProgress, STRATEGIES.ignore)
}

/**
 * INSERT OR REPLACE 模式：覆盖已存在
 * @returns {Promise<{added:number, updated:number, errors:string[]}>}
 *   注：better-sqlite3 的 changes() 在 REPLACE 时不区分 added/updated，
 *       所以这里把 changes() 全部计入 updated，新增行也归为 updated。
 *       如需严格区分，需要先 SELECT 一次判断（本函数不提供，避免额外查询）。
 */
async function batchInsertReplace(db, table, fields, rows, batchSize, onProgress) {
  const result = await runBatched(db, table, fields, rows, batchSize, onProgress, STRATEGIES.replace)
  // result 含 {added, skipped, errors}，但 IGNORE/REPLACE 都填 added（affected rows）
  // 为了语义清晰，重命名
  return {
    added: 0,         // REPLACE 模式下无法区分，全部归到 updated
    updated: result.added + result.skipped,  // 简化：REPLACE 的 affected rows
    errors: result.errors
  }
}

/**
 * 完全替换模式：DELETE 全部 + 重新 INSERT
 * @returns {Promise<{deleted:number, added:number, errors:string[]}>}
 *   - 整个流程在一个事务里（DELETE + INSERT）
 *   - 失败时整体回滚
 *   - 适合"全量重新加载某类基础数据"的场景
 */
async function batchInsertReplaceTable(db, table, fields, rows, batchSize, onProgress) {
  batchSize = batchSize || BATCH_DEFAULT
  const total = rows.length
  let deleted = 0
  let added = 0
  const errors = []

  // 整个 replace-table 在一个事务里：先 DELETE，再分批 INSERT
  const tx = db.transaction(() => {
    // 1) 清空表（如果表是 schedules 这种有外键的，需要调用方自行处理顺序）
    const before = db.prepare('SELECT COUNT(*) as c FROM ' + table).get().c
    db.prepare('DELETE FROM ' + table).run()
    deleted = before

    // 2) 分批 INSERT
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize)
      const placeholders = chunk.map(function () { return '(' + fields.map(function () { return '?'; }).join(',') + ')'; }).join(',')
      const flat = []
      for (const r of chunk) for (const f of fields) flat.push(r[f] != null ? r[f] : null)
      const sql = 'INSERT INTO ' + table + ' (' + fields.join(',') + ') VALUES ' + placeholders
      try {
        const stmt = db.prepare(sql)
        const info = stmt.run(...flat)
        added += info.changes
      } catch (e) {
        // 整批失败，逐行
        for (const row of chunk) {
          try {
            const ph = fields.map(function () { return '?'; }).join(',')
            const vals = fields.map(function (f) { return row[f] != null ? row[f] : null; })
            const stmt = db.prepare('INSERT INTO ' + table + ' (' + fields.join(',') + ') VALUES (' + ph + ')')
            const info = stmt.run(...vals)
            added += info.changes
          } catch (err) {
            errors.push('row failed: ' + JSON.stringify(row).slice(0, 200))
          }
        }
      }
      if (onProgress) onProgress(Math.min(i + batchSize, total), total)
    }
  })
  try {
    tx()
  } catch (e) {
    errors.push('transaction failed: ' + e.message)
    throw e
  }

  return { deleted, added, errors }
}

/**
 * 共享的批处理引擎
 */
async function runBatched(db, table, fields, rows, batchSize, onProgress, strategy) {
  batchSize = batchSize || BATCH_DEFAULT
  let added = 0
  let skipped = 0
  const errors = []
  const total = rows.length

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const placeholders = chunk.map(function () { return '(' + fields.map(function () { return '?'; }).join(',') + ')'; }).join(',')
    const flat = []
    for (const r of chunk) for (const f of fields) flat.push(r[f] != null ? r[f] : null)
    const sql = strategy.sql
      .replace('{table}', table)
      .replace('{fields}', fields.join(','))
      .replace('{rows}', placeholders)

    try {
      const stmt = db.prepare(sql)
      const info = stmt.run(...flat)
      // better-sqlite3 的 changes()：IGNORE 模式下返回 实际写入行数
      // REPLACE 模式下返回 实际 affected 行数（含覆盖）
      // 但无法逐行区分，所以这里把全部视为 added
      added += info.changes
    } catch (e) {
      // 整批失败 → 退化到逐行
      for (const row of chunk) {
        try {
          const ph = fields.map(function () { return '?'; }).join(',')
          const vals = fields.map(function (f) { return row[f] != null ? row[f] : null; })
          const singleSql = strategy.sql
            .replace('{table}', table)
            .replace('{fields}', fields.join(','))
            .replace('{rows}', '(' + ph + ')')
          const stmt = db.prepare(singleSql)
          const info = stmt.run(...vals)
          if (info.changes > 0) added++
          else skipped++
        } catch (err) {
          errors.push('row failed: ' + JSON.stringify(row).slice(0, 200))
        }
      }
    }
    if (onProgress) onProgress(Math.min(i + batchSize, total), total)
  }

  return { added, skipped, errors }
}

// 向后兼容：保留旧函数名
async function batchInsert(db, table, fields, rows, batchSize, onProgress) {
  return batchInsertIgnore(db, table, fields, rows, batchSize, onProgress)
}

module.exports = {
  BATCH_DEFAULT,
  batchInsert,           // 向后兼容：默认 IGNORE 模式
  batchInsertIgnore,
  batchInsertReplace,
  batchInsertReplaceTable
}
