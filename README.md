# 诊室排班管理后台 (Schedule Admin)

> 多院区医院排班管理的 **Web 后台 + Node.js API 服务**
>
> 配套**微信小程序前端**（独立仓库 `schedule-miniprogram`）
>
> 🚀 **一键部署**：5 分钟在腾讯云服务器上线

## ✨ 特性

- 🎨 **绿色主题 UI** - Vue 3 + Element Plus
- 🗄️ **零配置数据库** - SQLite 文件即库
- 📊 **完整数据管理** - 院区/诊区/诊室/医生/排班 CRUD
- 📥 **Excel 一键导入导出** - 模板下载 + 试导入 + 正式导入
- 🔐 **JWT 鉴权** - 多账号 + 角色管理
- 🐳 **Docker 一键部署** - 5 分钟上线
- 📱 **小程序配套** - API 兼容小程序端调用
- 🔄 **自动部署** - git push 即触发服务器更新

## 🏗️ 完整架构

```
┌────────────────────────────────────────────────────┐
│ 你的电脑 (Windows)                                  │
│   VSCode / Git                                     │
│   ↓ git push (SSH)                                  │
└─────────────────┬──────────────────────────────────┘
                  ↓
┌────────────────────────────────────────────────────┐
│ GitHub (peterpzj/schedule-admin)                   │
│   ↓ GitHub Actions (webhook)                        │
│   ↓ SSH 密钥（GitHub → 服务器）                      │
└─────────────────┬──────────────────────────────────┘
                  ↓
┌────────────────────────────────────────────────────┐
│ 你的腾讯云服务器                                    │
│   Docker Compose                                    │
│   ├── Backend (Express + SQLite) :3000              │
│   └── Frontend (Vue 3 静态文件)   :8080             │
│         ↑                                           │
│   Nginx 反代 + SSL (Let's Encrypt)                  │
│         ↑                                           │
└─────────┬──────────────────────────────────────────┘
          ↑ HTTPS + JWT
┌─────────────────────────────────────────────────────┐
│ 用户层                                              │
│   ├─ Web 后台用户   →  https://admin.your-domain.com │
│   └─ 微信小程序用户 →  https://api.your-domain.com   │
└─────────────────────────────────────────────────────┘
```

## 🚀 一键部署（5 分钟）

### 前提
- 腾讯云服务器（Ubuntu 20.04+，公网 IP）
- 两个子域名（`api.your-domain.com` 和 `admin.your-domain.com`）
- 域名已 ICP 备案并解析到服务器 IP

### 方案 A：服务器首次部署（一行命令）

SSH 登录服务器后：
```bash
# 一行完成所有初始化
sudo bash <(curl -sSL https://raw.githubusercontent.com/peterpzj/schedule-admin/main/云端部署/bootstrap.sh)
```

脚本会自动：
```
✓ [1/4] 安装 Docker / Nginx
✓ [2/4] 安装 Docker Compose Plugin
✓ [3/4] 克隆仓库到 /opt/schedule-admin
✓ [4/4] 运行主 bootstrap.sh：
   - 生成 .env（随机 JWT_SECRET + 管理员密码）
   - 构建 Docker 镜像
   - 启动容器
   - 配置 Nginx 反向代理
   - 申请 Let's Encrypt SSL 证书
   - 输出访问信息
```

### 方案 B：日常更新（一行命令）

服务器上：
```bash
cd /opt/schedule-admin
./deploy.sh            # 拉代码 + 重启 + 健康检查
./deploy.sh --logs     # 部署后看日志
./deploy.sh --rollback # 出问题回滚
```

**deploy.sh 智能特性**：
- 自动备份数据库（保留 14 天）
- 健康检查（轮询 15 次）
- 检查失败**自动回滚**到上一个 commit
- 彩色输出，错误清晰

### 方案 C：推送即自动部署（推荐）

我已经在 `.github/workflows/deploy.yml` 配置好。

**首次配置**（在仓库 Settings → Secrets）：
| Secret | 值 |
|--------|---|
| `SERVER_HOST` | 你的服务器 IP |
| `SERVER_USER` | `root` 或 `ubuntu` |
| `SERVER_SSH_KEY` | 服务器上生成的私钥 |

**之后**：
```bash
# 本地写完代码，提交推送
git add . && git commit -m "更新"
git push  # 触发 GitHub Actions → 自动部署到服务器
```

---

## 📦 项目结构

```
admin/
├── backend/                     # Node.js API 服务
│   ├── server.js               # 入口（含 /api/health / /api/version）
│   ├── package.json
│   ├── Dockerfile
│   ├── db/
│   │   ├── index.js            # 初始化 + 表结构
│   │   └── queries.js          # 公共查询
│   ├── middleware/
│   │   ├── auth.js             # JWT 鉴权
│   │   └── audit.js            # 操作日志
│   └── routes/
│       ├── auth.js             # POST /login, GET /me, POST /change-password
│       ├── campuses.js         # 院区 CRUD
│       ├── departments.js      # 科室 CRUD
│       ├── clinicTypes.js      # 门诊类型 CRUD
│       ├── zones.js            # 诊区 CRUD
│       ├── rooms.js            # 诊室 CRUD
│       ├── timeSlots.js        # 时段 CRUD
│       ├── doctors.js          # 医生 CRUD
│       ├── schedules.js        # 排班 CRUD + 批量 + 冲突检查
│       ├── excel.js            # Excel 上传/下载/模板
│       └── _crud_factory.js   # 通用 CRUD 工厂
│
├── frontend/                    # Vue 3 后台
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js
│       ├── App.vue
│       ├── api/index.js         # axios 客户端
│       ├── stores/auth.js       # Pinia
│       ├── router/index.js      # Vue Router + 守卫
│       ├── layouts/DefaultLayout.vue
│       ├── components/GenericCrud.vue
│       ├── styles/global.css   # 绿色主题
│       └── views/              # 11 个页面
│           ├── Login.vue
│           ├── Dashboard.vue
│           ├── Campuses.vue
│           ├── Departments.vue
│           ├── ClinicTypes.vue
│           ├── Zones.vue
│           ├── Rooms.vue
│           ├── TimeSlots.vue
│           ├── Doctors.vue
│           ├── Schedules.vue
│           ├── ImportExport.vue
│           └── Settings.vue
│
├── .github/workflows/
│   ├── ci.yml                  # PR/Push 时语法检查
│   └── deploy.yml               # 推送 main → 自动部署服务器
│
├── docker-compose.yml           # 一键启动
├── nginx.conf                   # Nginx 配置（仅供 frontend 容器内部用）
├── bootstrap.sh                 # 首次部署（已 clone 仓库后运行）
├── deploy.sh                    # 日常部署（拉代码 + 重启 + 健康检查）
├── .env.example                 # 配置模板
└── README.md
```

## 🔌 API 接口（小程序 + Web 共用）

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/version` | GET | API 版本信息 |
| `/api/auth/login` | POST | 登录（返回 JWT） |
| `/api/auth/me` | GET | 当前用户 |
| `/api/auth/change-password` | POST | 修改密码 |
| `/api/auth/users` | GET/POST | 用户管理（admin） |
| `/api/campuses` | 全 | 院区 CRUD |
| `/api/departments` | 全 | 科室CRUD |
| `/api/clinicTypes` | 全 | 门诊类型CRUD |
| `/api/zones` | 全 | 诊区CRUD |
| `/api/rooms` | 全 | 诊室CRUD |
| `/api/timeSlots` | 全 | 时段CRUD |
| `/api/doctors` | 全 | 医生CRUD |
| `/api/schedules` | 全 | 排班CRUD + 冲突检查 |
| `/api/schedules/batch` | POST | 批量导入（≤100条/次） |
| `/api/metadata` | GET | 一次性返回所有基础数据 |
| `/api/excel/import` | POST | Excel 上传解析 |
| `/api/excel/export` | GET | Excel 导出 |
| `/api/excel/template` | GET | 下载模板 |

## 📱 配套小程序

小程序仓库：`peterpzj/schedule-miniprogram`（独立项目）

### 小程序配置（部署前必改）

打开小程序项目 `miniprogram/config/app.js`：

```js
module.exports = {
  // 改成你的 API 地址
  API_BASE_URL: 'https://api.your-domain.com',
  // 调试用：true = 永远用 mock；false = 调用 API
  USE_MOCK_ONLY: false
};
```

### 微信公众平台配置

1. 登录 https://mp.weixin.qq.com/
2. **开发管理 → 开发设置 → 服务器域名**
3. **request 合法域名** 添加：`https://api.your-domain.com`

> 完整对接说明：[DEPLOY_INTEGRATION.md](DEPLOY_INTEGRATION.md)

## 🛠️ 本地开发

```bash
# 1. 启动后端（需要 Node.js 18+）
cd backend
npm install
npm start  # → http://localhost:3000

# 2. 启动 Web 前端
cd frontend
npm install
npm run dev  # → http://localhost:8080
```

默认账号：`admin` / `admin123`（首次启动时自动创建在 SQLite）

## 🐳 Docker 命令速查

```bash
cd /opt/schedule-admin

# 启动 / 停止 / 重启
docker compose up -d
docker compose down
docker compose restart

# 重新构建
docker compose build
docker compose build --no-cache
docker compose up -d

# 查看
docker compose ps
docker compose logs -f
docker compose logs -f backend

# 进入后端容器调试
docker compose exec backend sh

# 备份数据库
docker compose exec backend cat /app/data/schedule.db > backup.db
```

## 📊 数据库表

| 表 | 说明 | 关键字段 |
|----|------|----------|
| `users` | 管理员账号 | username, password_hash, role |
| `campuses` | 院区 | name, code, sort_order |
| `departments` | 科室 | name, code |
| `clinic_types` | 门诊类型 | name, code, sort_order |
| `zones` | 诊区 | name, code, campus_code |
| `rooms` | 诊室 | room_id, campus_code, zone_code |
| `time_slots` | 时段 | name, campus_code, clinic_type_code, period, start_time, end_time |
| `doctors` | 医生 | name, work_id, department, title |
| `schedules` | 排班（周模板） | doctor_id, campus_code, room_id, day_of_week, time_slot_code |
| `audit_logs` | 操作日志 | user_id, action, entity, ip |

## 🔐 部署后必须做的事

1. ⚠️  立即修改默认密码 `admin/admin123`
2. ⚠️  在 Web 后台「系统设置」创建自己的账号并禁用 `admin`
3. 启用 HTTPS（bootstrap.sh 已自动处理）
4. 配置定期备份 cron

## 🚨 常见问题

### Q: 健康检查返回 000
- 服务器没起来：`cd /opt/schedule-admin && docker compose ps`
- 端口占用：`sudo netstat -tlnp | grep 3000`
- 防火墙：`sudo ufw status`

### Q: 推送触发部署失败
- 查看 GitHub Actions 日志
- 检查 Secrets 是否正确
- 测试 SSH：`ssh -i ~/.ssh/deploy_key user@server`

### Q: 小程序报"不在 request 合法域名"
- 微信公众平台加 `https://api.your-domain.com`
- 必须 HTTPS（HTTP 不行）
- 必须 ICP 备案

### Q: 502 Bad Gateway
- 容器没启动：`docker compose up -d`
- 端口冲突：`docker compose logs`
- 健康检查：`curl http://localhost:3000/api/health`

## 📞 联系

- 项目维护：开发组
- 部署时间：2026-06
- License: Private

---

**⭐ 觉得好用？点 Star 支持一下！**
