-- 005: 用户角色扩展为三角色 admin | editor | viewer
-- 背景：原 schema 默认 role='admin'，代码层面只有 'admin' / 'user' 两个值。
-- 前端 router 已使用 ROLES.EDITOR / ROLES.VIEWER，但后端不支持导致守卫永远拒绝。
-- 策略：
--   - 已有账号全部迁移到对应档位
--     'admin' → 保持 'admin'
--     'user'  → 'viewer' （普通用户降为只读）
--   - CHECK 约束防止后续写入非法 role
--   - 不变更 users 表结构，只扩 role 字段取值范围

-- 1) 把所有 'user' 改为 'viewer'（语义对齐）
UPDATE users SET role = 'viewer' WHERE role = 'user';

-- 2) 任何不在白名单的角色归一为 'viewer'
UPDATE users SET role = 'viewer' WHERE role NOT IN ('admin', 'editor', 'viewer');

-- 3) CHECK 约束（SQLite 19+ 支持，如不可用则由应用层校验兜底）
--    注意：SQLite 修改 CHECK 约束需要重建表，但此处为"新建约束" → 直接 ALTER 会被忽略。
--    我们把约束放到应用层（lib/roles.js + auth.js 的 roleValidator），更稳。

-- 索引：按 role 查账号列表会用到
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);