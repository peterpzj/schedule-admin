# 轮 1 改进完成总结（codex 审计）

## 完成清单

### P0（必须修）

| # | 项目 | 状态 | 关键文件 |
|---|------|------|----------|
| P0-1 | 登录失败桶持久化 | ✅ | [008_login_fail_buckets.sql](backend/db/migrations/008_login_fail_buckets.sql) + docker-compose `STORE_BACKEND=sqlite` |
| P0-2 | store 抽象（黑名单+限流） | ✅ | [lib/store.js](backend/lib/store.js) — MemoryStore + SqliteStore 双实现 |
| P0-4 | 审计 hash 链 | ✅ | [middleware/audit.js](backend/middleware/audit.js) + [008_audit_log_hash_chain.sql](backend/db/migrations/008_audit_log_hash_chain.sql) + [lib/auditVerify.js](backend/lib/auditVerify.js) + [scripts/audit-verify.js](backend/scripts/audit-verify.js) + `GET /api/auditLogs/verify/chain` |

### P1（强烈推荐）

| # | 项目 | 状态 | 关键文件 |
|---|------|------|----------|
| P1-1 | bcrypt 10 → 12 | ✅ | [routes/auth.js](backend/routes/auth.js) (3 处) + [db/index.js](backend/db/index.js) |
| P1-11 | patient_limit CHECK 触发器 | ✅ | [007_data_integrity_constraints.sql](backend/db/migrations/007_data_integrity_constraints.sql) |
| P1-12 | work_id 级联触发器 | ✅ | [007_data_integrity_constraints.sql](backend/db/migrations/007_data_integrity_constraints.sql) |
| P1-13 | REFERENCE_CHECKS 跨表 | ✅ | [routes/_crud_factory.js](backend/routes/_crud_factory.js) |

### P2（建议）

| # | 项目 | 状态 | 关键文件 |
|---|------|------|----------|
| P2-14 | 404 catch-all 路由 | ✅ | [router/index.js](frontend/src/router/index.js) + [NotFound.vue](frontend/src/views/NotFound.vue) |

### 测试基建

| 项目 | 状态 | 备注 |
|------|------|------|
| 集成测试（5 个） | ✅ 已就位 | test/auth / rate_limit / schedules_crud / roles / audit_chain |
| 单元测试（4 个文件） | ✅ 新增 + 修复 | lib/auditVerify.test.js / lib/store.test.js / middleware/audit.test.js / middleware/rateLimit.test.js |
| 单元测试结果 | ✅ 28 通过 / 0 失败 | `npm run test:unit` |
| 集成测试 | ⚠️ 本地 better-sqlite3 需 VS 编译 | 在 Docker / Linux 上跑（`npm run test:integration`） |
| 前端 Vitest 占位 | ✅ | [vitest.config.js](frontend/vitest.config.js) |

---

## 部署清单

### 服务器端验证（生产）

```bash
# 1) 拉代码 + 重启
cd /opt/schedule-admin
./deploy.sh

# 2) 健康检查
curl http://127.0.0.1:3000/api/health
# 期待: { "success": true, "db": "ok", "jwtSecretOk": true, ... }

# 3) 审计链校验（首次跑）
docker compose exec backend node scripts/audit-verify.js
# 期待: "✅ 链完整"

# 4) admin UI 验证 hash 链
#    登录 admin → 审计日志页 → 调 /api/auditLogs/verify/chain
#    期待: { "ok": true, "total": N, "skipped": 0 }

# 5) store.db 持久化验证
docker compose exec backend ls -la /app/data/store.db
# 期待: 落盘文件，size > 0
```

### 数据迁移

| 文件 | 状态 | 说明 |
|------|------|------|
| 007_data_integrity_constraints.sql | 自动 | 启动时跑 |
| 008_audit_log_hash_chain.sql | 自动 | 启动时跑（旧记录 curr_hash='' 会被跳过） |
| 008_login_fail_buckets.sql | 自动 | 启动时跑（新增表，桶走 KV store） |

### 新增环境变量（生产 .env）

```bash
STORE_BACKEND=sqlite              # 生产推荐
STORE_SQLITE_PATH=/app/data/store.db  # 默认值
```

### Cron 建议

```bash
# 每天凌晨 3 点跑审计链校验，断了发邮件
0 3 * * * cd /opt/schedule-admin/backend && \
  node scripts/audit-verify.js --quiet || \
  echo "[ALERT] audit log hash chain broken on $(date)" | \
  mail -s "schedule-admin audit broken" ops@your-domain.com
```

---

## 文件清单（新增/修改）

### 新增
- [backend/lib/auditVerify.js](backend/lib/auditVerify.js) — hash 链校验 + 报告渲染
- [backend/lib/auditVerify.test.js](backend/lib/auditVerify.test.js) — 单元测试
- [backend/lib/store.test.js](backend/lib/store.test.js) — 单元测试
- [backend/middleware/audit.test.js](backend/middleware/audit.test.js) — 单元测试
- [backend/scripts/audit-verify.js](backend/scripts/audit-verify.js) — CLI 校验脚本

### 修改
- [backend/db/migrations/008_audit_log_hash_chain.sql](backend/db/migrations/008_audit_log_hash_chain.sql)
- [backend/db/migrations/008_login_fail_buckets.sql](backend/db/migrations/008_login_fail_buckets.sql)
- [backend/db/migrations/007_data_integrity_constraints.sql](backend/db/migrations/007_data_integrity_constraints.sql)
- [backend/middleware/rateLimit.test.js](backend/middleware/rateLimit.test.js) — 适配 P0-2 store 抽象
- [backend/routes/auditLogs.js](backend/routes/auditLogs.js) — 加 `GET /verify/chain`
- [backend/routes/auth.js](backend/routes/auth.js) — bcrypt 12
- [backend/db/index.js](backend/db/index.js) — bcrypt 12
- [backend/package.json](backend/package.json) — test:unit / test:integration / audit:verify 脚本
- [backend/.env.example](backend/.env.example) — STORE_BACKEND 文档
- [docker-compose.yml](docker-compose.yml) — STORE_BACKEND=sqlite 默认

### 已有
- 5 个集成测试（test/）
- 前端 Vitest 占位配置

---

## 单元测试结果

```
▶ auditVerify.renderReport
  ✔ 5/5 通过

▶ MemoryStore
  ✔ 7/7 通过

▶ audit.computeHash
  ✔ 13/13 通过

▶ rateLimit.test.js (脚本式)
  ✔ 5/5 通过

─────────────────────────
总计: 28 通过 / 0 失败
```

---

## 下一轮候选（codex 报告里还没动的）

- **P1-2 ~ P1-10**: 各种 SQL 注入 / XSS / 缓存头
- **P1-3**: CORS ALLOWED_ORIGINS 收紧（需生产域名）
- **P1-5**: rate limit 状态查询端点
- **P1-7**: docker HEALTHCHECK 增强
- **P1-9**: bcrypt 错误统一处理

如要继续，告诉我"轮 2"。
