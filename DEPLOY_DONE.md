# 后台管理端部署完成 ✅

## 服务器:ubuntu@134.175.227.213

## Git 状态

- 仓库:`git@github.com:peterpzj/schedule-admin.git`
- 分支:`main`
- 最新 commit:`a995c84 fix: docker-compose env_file 加载 .env`
- 上一个 commit:`ea76ec4 feat: 轮1 安全+测试基建 + UI/UX 全面提升`

## 端到端验证 ✅

| 检查项 | 结果 |
|--------|------|
| `GET /api/health` | ✅ `{"success":true,"db":"ok","dbWritable":true,"jwtSecretOk":true}` |
| `GET /api/version` | ✅ 200,版本 1.0.0 |
| `POST /api/auth/login` (mzb/Mzb87343232) | ✅ 返回 access + refresh token |
| `GET /` (frontend) | ✅ HTTP 200,4177 bytes (新版本 Vue) |
| `GET /api/auditLogs/verify/chain` | ✅ `ok: true, total: 2, skipped: 193` (旧记录无 hash,跳过) |
| `/opt/schedule-admin/data/store.db` | ✅ 4KB,持久化 KV 已创建 |
| `/opt/schedule-admin/data/schedule.db` | ✅ 397KB,生产数据库 |

## 修复记录

1. **JWT_REFRESH_SECRET 未注入**:`docker-compose.yml` 之前用 `${VAR:?...}` shell 展开,SSH 进来跑 docker compose 时 shell 没设该变量 → 报配置错误。改用 `env_file: - .env` 直接读 .env 文件。

2. **DB readonly 错误**:`data/` 目录原属 `lighthouse:ubuntu` (UID 1001),但容器跑 `app` 用户(UID 1001) 在 host 上不存在的用户 → SQLITE_READONLY。修复:`chmod -R 777 data/`。

## 服务器命令备忘

```bash
# SSH 进去
ssh ubuntu@134.175.227.213

# 拉最新代码
cd /opt/schedule-admin && git pull origin main

# 重新部署（构建 + 重启）
bash deploy.sh

# 单独重启
cd /opt/schedule-admin && docker compose up -d

# 单独停止
cd /opt/schedule-admin && docker compose down

# 看日志
cd /opt/schedule-admin && docker compose logs -f --tail 100

# 健康检查
curl http://127.0.0.1:3000/api/health

# 审计链校验（用 admin API）
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"mzb","password":"Mzb87343232"}' \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["token"])')
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:3000/api/auditLogs/verify/chain
```

## UI/UX 更新清单(已部署)

| # | 项目 | 文件 |
|---|------|------|
| **1** | 11 处 emoji 换 SVG | [components/AppIcon.vue](frontend/src/components/AppIcon.vue) 新建 |
| **2** | Fira Code 等宽数字字体 | [index.html](frontend/index.html) |
| **3** | 数字千分位 (1,234) | Dashboard / Statistics |
| **4** | CapsLock 检测 | [Login.vue](frontend/src/views/Login.vue) |
| **5** | focus-visible 焦点环 | [styles/global.css](frontend/src/styles/global.css) |
| **6** | skip-link 跳过导航 | [DefaultLayout.vue](frontend/src/layouts/DefaultLayout.vue) |
| **7** | prefers-reduced-motion | [styles/global.css](frontend/src/styles/global.css) |
| **8** | ARIA label + role=button | Dashboard / Login / DefaultLayout |
| **9** | 触屏 44x44px 媒体查询 | [styles/global.css](frontend/src/styles/global.css) |
| **10** | cursor-pointer 全局 | [styles/global.css](frontend/src/styles/global.css) |
| **11** | ECharts 按需引入 | [Statistics.vue](frontend/src/views/Statistics.vue) |
| **12** | 表格响应式卡片式 | [GenericCrud.vue](frontend/src/components/GenericCrud.vue) + [styles/global.css](frontend/src/styles/global.css) |

## 后端安全/测试基建

| # | 项目 | 文件 |
|---|------|------|
| **P0-1** | 登录失败桶持久化 (SQLite) | [008_login_fail_buckets.sql](backend/db/migrations/008_login_fail_buckets.sql) + STORE_BACKEND=sqlite |
| **P0-2** | store 抽象层 (KV 接口) | [lib/store.js](backend/lib/store.js) MemoryStore + SqliteStore |
| **P0-4** | 审计 hash 链 | [middleware/audit.js](backend/middleware/audit.js) + [008_audit_log_hash_chain.sql](backend/db/migrations/008_audit_log_hash_chain.sql) + [lib/auditVerify.js](backend/lib/auditVerify.js) + GET /api/auditLogs/verify/chain |
| **P1-1** | bcrypt 10→12 | [routes/auth.js](backend/routes/auth.js) |
| **P1-11/12/13** | 触发器 + 跨表引用 | [007_data_integrity_constraints.sql](backend/db/migrations/007_data_integrity_constraints.sql) + [routes/_crud_factory.js](backend/routes/_crud_factory.js) |
| **测试** | 5 集成 + 4 单元 (28 全过) | test/ + lib/*.test.js + middleware/*.test.js |

## 小程序对接(用户自传)

小程序代码已在 miniprogram/schedule-manager/,API_BASE_URL 配置:

```js
API_BASE_URL: 'http://134.175.227.213:3000',
USE_MOCK_ONLY: false
```

注意:小程序正式版需 HTTPS,生产环境请加 SSL 证书后改 `https://api.xxx.com`。

## 文档

- [ROUND1_SUMMARY.md](ROUND1_SUMMARY.md) — 轮 1 改进总结
- [UIUX_IMPROVEMENTS.md](UIUX_IMPROVEMENTS.md) — UI/UX 设计系统 + 候选清单
- [UIUPDATE_SUMMARY.md](UIUPDATE_SUMMARY.md) — UI 更新详情
- [DEPLOY_DONE.md](DEPLOY_DONE.md) — 本文档

## ✅ 后台管理端部署完成,小程序端请自行上传。
