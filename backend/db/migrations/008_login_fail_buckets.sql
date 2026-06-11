-- 008: 登录失败桶持久化
-- 之前用进程内存 Map 记录失败次数，进程崩溃或重启后被清空
-- 攻击者可借重启窗口绕过账号锁定
-- 修复：落 SQLite 表 login_fail_buckets，含 1 分钟定时清理
--
-- 表结构：
--   username     TEXT PRIMARY KEY   归一化 lowercase
--   count        INTEGER NOT NULL  当前失败次数
--   reset_at     TEXT NOT NULL     窗口到期时间 (ISO)
--   updated_at   TEXT NOT NULL     最近一次失败时间 (ISO)
--
-- 索引：reset_at 索引加速"清理过期桶"的 DELETE

CREATE TABLE IF NOT EXISTS login_fail_buckets (
  username    TEXT PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  reset_at    TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_login_fail_buckets_reset_at
  ON login_fail_buckets(reset_at);