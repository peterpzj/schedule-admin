# 诊室排班管理后台 (Schedule Admin)

> 多院区医院排班管理的 Web 后台 + Node.js API 服务
>
> 配套微信小程序：[schedule-manager-miniprogram](#)

## ✨ 特性

- 🎨 **绿色主题 UI** - Vue 3 + Element Plus
- 🗄️ **零配置数据库** - SQLite 文件即库
- 📊 **完整数据管理** - 院区/诊区/诊室/医生/排班 CRUD
- 📥 **Excel 一键导入导出** - 模板下载 + 试导入 + 正式导入
- 🔐 **JWT 鉴权** - 多账号 + 角色管理
- 🐳 **Docker 一键部署** - 5 分钟上线
- 📱 **小程序配套** - API 兼容小程序端调用

## 🏗️ 架构

```
┌────────────────────────────────────────┐
│         你的腾讯云服务器                │
│                                        │
│  ┌──────────┐    ┌──────────────┐     │
│  │ Frontend │ -> │   Backend    │     │
│  │  (Nginx) │    │ (Express+SQLite)│  │
│  │   :443   │    │     :3000    │     │
│  └──────────┘    └──────────────┘     │
│        ↑                ↑              │
│   Web 后台用户    微信小程序 (前端)    │
└────────────────────────────────────────┘
```

## 🚀 一键部署（5 分钟）

### 前提
- 腾讯云服务器（Ubuntu 20.04+）
- 两个子域名（`api.your-domain.com` 和 `admin.your-domain.com`）
- 域名已 ICP 备案

### 在服务器上运行（全新服务器）

```bash
# 一行命令完成所有初始化
bash <(curl -sSL https://raw.githubusercontent.com/YOUR_USER/schedule-admin/main/bootstrap.sh)
```

> 替换 `YOUR_USER` 为你的 GitHub 用户名

### 已部署的服务器更新

```bash
cd /opt/schedule-admin
./deploy.sh           # 拉代码 + 重启
./deploy.sh --no-cache # 强制重新构建
./deploy.sh --logs     # 部署后看日志
```

## 📦 项目结构

```
admin/
├── backend/                # Node.js API 服务
│   ├── server.js
│   ├── package.json
│   ├── Dockerfile
│   ├── db/
│   │   ├── index.js       # 初始化 + 表结构
│   │   └── queries.js
│   ├── middleware/
│   │   ├── auth.js        # JWT
│   │   └── audit.js       # 操作日志
│   └── routes/             # 9 个 API 路由
│       ├── auth.js
│       ├── campuses.js
│       ├── departments.js
│       ├── clinicTypes.js
│       ├── zones.js
│       ├── rooms.js
│       ├── timeSlots.js
│       ├── doctors.js
│       ├── schedules.js
│       ├── excel.js        # Excel 路由
│       └── _crud_factory.js
│
├── frontend/                # Vue 3 后台
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js
│       ├── App.vue
│       ├── api/             # axios
│       ├── stores/          # Pinia
│       ├── router/
│       ├── layouts/
│       ├── components/
│       ├── views/           # 11 个页面
│       │   ├── Login.vue
│       │   ├── Dashboard.vue
│       │   ├── Campuses.vue
│       │   ├── Departments.vue
│       │   ├── ClinicTypes.vue
│       │   ├── Zones.vue
│       │   ├── Rooms.vue
│       │   ├── TimeSlots.vue
│       │   ├── Doctors.vue
│       │   ├── Schedules.vue
│       │   ├── ImportExport.vue
│       │   └── Settings.vue
│       └── styles/
│
├── .github/workflows/       # GitHub Actions
│   └── ci.yml
├── docker-compose.yml        # 一键启动
├── nginx.conf
├── bootstrap.sh              # 首次初始化
├── deploy.sh                 # 日常更新
├── .env.example              # 配置模板
└── README.md
```

## 🔌 API 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 登录 |
| `/api/auth/me` | GET | 当前用户 |
| `/api/auth/change-password` | POST | 修改密码 |
| `/api/auth/users` | GET/POST | 用户管理 |
| `/api/campuses` | GET/POST/PUT/DELETE | 院区 CRUD |
| `/api/departments` | 同上 | 科室 |
| `/api/clinicTypes` | 同上 | 门诊类型 |
| `/api/zones` | 同上 | 诊区 |
| `/api/rooms` | 同上 | 诊室 |
| `/api/timeSlots` | 同上 | 时段 |
| `/api/doctors` | 同上 | 医生 |
| `/api/schedules` | 同上 | 排班 |
| `/api/schedules/batch` | POST | 批量导入 |
| `/api/metadata` | GET | 全部基础数据（一次拿） |
| `/api/excel/import` | POST | Excel 上传 |
| `/api/excel/export` | GET | Excel 导出 |
| `/api/excel/template` | GET | 下载模板 |

## 🛠️ 本地开发

```bash
# 终端 1：启动后端
cd backend
npm install
npm start
# → http://localhost:3000

# 终端 2：启动 Web 前端
cd frontend
npm install
npm run dev
# → http://localhost:8080
```

默认管理员账号：`admin` / `admin123`（首次启动时创建）

## 🐳 Docker 命令速查

```bash
# 启动
docker compose up -d

# 停止
docker compose down

# 查看日志
docker compose logs -f

# 重新构建
docker compose build --no-cache
docker compose up -d

# 查看运行状态
docker compose ps

# 进入后端容器
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
| `audit_logs` | 操作日志 | user_id, action, entity |

## 🔐 部署后必须做的事

1. ⚠️  立即修改默认密码 `admin/admin123`
2. ⚠️  在 Web 后台「系统设置」创建自己的账号并禁用 `admin`
3. 启用 HTTPS（bootstrap.sh 已自动处理）
4. 配置定期备份 cron

## 📚 相关项目

- 小程序前端：[schedule-manager-miniprogram](https://github.com/YOUR_USER/schedule-manager-miniprogram)
- 数据结构：[data_structure.md](data_structure.md)

## 📝 License

Private / 内网使用
