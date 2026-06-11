-- 008: 审计日志防篡改 — hash 链
--
-- 背景：任何能登入 admin 的用户理论上都能 UPDATE 旧 audit_logs
-- 修复：每条记录加 prev_hash（上一条的 hash）和 curr_hash（本条 hash）
--   - 链式结构：curr_hash = sha256(prev_hash || user_id || action || entity || entity_id || details || ip || created_at)
--   - 校验：定期跑 lib/auditVerify.js 顺着链查哈希，任意一条被改 → 后续整条链全失效
--   - 优势：不需要外部账本、纯 hash 链、SQLite 自洽
--   - 限制：能登入数据库的攻击者既能改记录也能重算 hash，需要配合 DB 权限控制
--
-- 数据迁移：现有 audit_logs 记录没有 hash 列
--   1) 加列（允许 NULL）
--   2) 给所有现有记录回填 prev_hash = '' / curr_hash = ''
--   3) 之后新写入的记录自动算 hash
--
-- schema_migrations 表的 INSERT 由 migrate.js 自动处理（applyOne）
-- 这里的 SQL 只需包含"建表 / 加列 / 索引"等 DDL

ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT DEFAULT '';
ALTER TABLE audit_logs ADD COLUMN curr_hash TEXT DEFAULT '';
ALTER TABLE audit_logs ADD COLUMN hash_algo TEXT DEFAULT 'sha256';

-- 索引：链式校验按 id ASC 顺序扫，curr_hash 索引可用于定位
CREATE INDEX IF NOT EXISTS idx_audit_logs_hash ON audit_logs(curr_hash) WHERE curr_hash != '';