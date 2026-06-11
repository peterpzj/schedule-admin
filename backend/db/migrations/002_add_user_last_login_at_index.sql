-- Migration: 002_add_user_last_login_at_index
-- Created: 2026-06-08
-- 目的：users.last_login_at 频繁查询（dashboard / 审计），加索引
-- 说明：001_init.sql 已建表，本迁移加额外索引

CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

-- Down:
DROP INDEX IF EXISTS idx_users_last_login_at;
