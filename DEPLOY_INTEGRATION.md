# 小程序 ↔ 后台 完整对接文档

> **两个独立仓库**：
> - 仓库 1（本仓库）：`peterpzj/schedule-admin` — Web 后台 + API
> - 仓库 2：`peterpzj/schedule-miniprogram` — 微信小程序前端
>
> **目标**：小程序通过 HTTPS 调用本仓库的 API

---

## 📐 整体架构

```
┌────────────────────┐    ┌────────────────────┐
│  schedule-admin    │    │ schedule-miniprogram│
│  (本仓库)          │    │  (独立仓库)         │
│                    │    │                    │
│  ┌──────────────┐  │    │  微信小程序原生代码  │
│  │  Backend    │◄─┼────┼──┤  utils/api.js      │
│  │  (Express)  │  │    │  调 wx.request     │
│  └──────┬───────┘  │    │                    │
│         │          │    │  12 个页面          │
│  ┌──────┴───────┐  │    │  (login/index/      │
│  │  Frontend   │  │    │   schedule/...)     │
│  │  (Vue 3)    │  │    └────────────────────┘
│  └──────────────┘  │
└────────────────────┘
```

---

## 🚀 部署步骤（2 步走）

### 步骤 1：部署后端（一次性）

按 [README.md](README.md) 部署本仓库到你的腾讯云服务器。

完成后记下：
- API 域名：`https://api.your-domain.com`
- Web 后台域名：`https://admin.your-domain.com`
- 默认账号：`admin` / `admin123`（登录后立即修改！）

### 步骤 2：配置小程序

#### 2.1 修改小程序配置

打开小程序项目 [`miniprogram/config/app.js`](../../miniprogram/schedule-manager/miniprogram/config/app.js)：

```js
module.exports = {
  // ★ 必改：替换为你的 API 域名
  API_BASE_URL: 'https://api.your-domain.com',

  // 调试用：true = 永远用 mock；false = 调用真实 API
  USE_MOCK_ONLY: false
};
```

#### 2.2 微信公众平台添加服务器域名

1. 打开 https://mp.weixin.qq.com/
2. 进入 **开发管理 → 开发设置 → 服务器域名**
3. 在 **request 合法域名** 中添加：
   ```
   https://api.your-domain.com
   ```
4. 保存

> ⚠️ 必须 HTTPS（HTTP 域名无法添加）
> ⚠️ 必须是 ICP 备案过的域名

#### 2.3 重新编译并发布

1. 微信开发者工具 → 重新编译
2. 测试登录：账号 `MZB` / 密码 `87343232`（本地模式）
   或 `admin` / `<你设置的密码>`（云端模式）
3. 提交审核 → 发布

---

## 🔌 API 接口清单

### 通用约定

```
Base URL:    https://api.your-domain.com
请求格式:    Content-Type: application/json
认证方式:    Authorization: Bearer <JWT_TOKEN>
响应格式:    { success: true, data: {...} } 或 { success: false, error: '...' }
分页:        ?page=1&pageSize=20&q=搜索
```

### 认证

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

响应：
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "name": "系统管理员",
    "role": "admin"
  }
}
```

小程序端调用示例：
```js
const res = await callApi('POST', '/api/auth/login', { username, password });
// res.token, res.user
```

### 一次性获取所有基础数据

```http
GET /api/metadata
```

返回 7 个集合（campusTypes/zones/rooms/timeSlots/doctors），小程序 `getMetadata` 调用。

### 排班查询

```http
GET /api/schedules?date=2026-06-15&campusCode=YX&clinicTypeCode=TESE
```

| 参数 | 说明 |
|------|------|
| `date` | YYYY-MM-DD（自动转换为 dayOfWeek 过滤） |
| `dayOfWeek` | 1-7（直接过滤周几） |
| `campusCode` | 院区代码（YX / HP / TH） |
| `zoneCode` | 诊区代码（YX-Z1 等） |
| `clinicTypeCode` | 门诊类型代码 |
| `period` | 上午/中午/下午 |
| `doctorId` | 医生 _id |
| `doctorName` | 医生姓名（模糊匹配） |
| `roomId` | 诊室编号 |

返回：
```json
{
  "success": true,
  "data": [
    {
      "_id": 1,
      "doctorId": 1,
      "doctorName": "张文华",
      "workId": "M001",
      "department": "内科",
      "campusCode": "YX",
      "campus": "越秀院区",
      "zoneCode": "YX-Z1",
      "zoneName": "一诊区",
      "roomId": "301",
      "roomName": "301诊室",
      "clinicTypeCode": "TESE",
      "clinicTypeName": "特需门诊",
      "timeSlotId": 1,
      "timeSlotCode": "YX-TESE-M1",
      "period": "上午",
      "startTime": "08:30",
      "endTime": "10:30",
      "dayOfWeek": 1,
      "remark": "",
      "patientLimit": 30
    }
  ]
}
```

### 新增排班

```http
POST /api/schedules
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "doctorId": 1,
  "doctorName": "张文华",
  "workId": "M001",
  "department": "内科",
  "campusCode": "YX",
  "campus": "越秀院区",
  "zoneCode": "YX-Z1",
  "zoneName": "一诊区",
  "roomId": "301",
  "roomName": "301诊室",
  "clinicTypeCode": "TESE",
  "clinicTypeName": "特需门诊",
  "timeSlotId": 1,
  "timeSlotCode": "YX-TESE-M1",
  "period": "上午",
  "startTime": "08:30",
  "endTime": "10:30",
  "dayOfWeek": 1,
  "remark": "",
  "patientLimit": 30
}
```

### 修改 / 删除 排班

```http
PUT /api/schedules/<_id>
DELETE /api/schedules/<_id>
```

### 批量导入

```http
POST /api/schedules/batch
{
  "list": [
    { ... 排班1 ... },
    { ... 排班2 ... }
  ]
}
```
单次最多 100 条。

---

## 🔄 完整数据流

### 场景 1：Web 后台新增排班 → 小程序看到

```
1. 管理员在 Web 后台点击「新增排班」
2. 浏览器 POST /api/schedules（带 JWT）
3. 后端写入 SQLite
4. 小程序用户打开「排班查询」页面
5. 小程序 GET /api/schedules?date=...
6. 后端从 SQLite 读取
7. 排班列表显示
```

### 场景 2：小程序管理员添加排班

```
1. 小程序用户输入排班信息
2. 小程序 POST /api/schedules（自动附加 token）
3. 后端写入 SQLite
4. UI 刷新列表
5. Web 后台同步看到
```

---

## 🆘 故障排查

### 错误：`不在以下 request 合法域名列表中`

**原因**：未在微信公众平台配置 API 域名。
**解决**：见步骤 2.2。

### 错误：`request:fail`（小程序控制台）

**原因 1**：服务器没起来 / 端口没开
**排查**：
```bash
ssh user@server
curl https://api.your-domain.com/api/health
```

**原因 2**：SSL 证书问题
**排查**：
```bash
curl -vI https://api.your-domain.com/api/health
```

**原因 3**：CORS 跨域（如果用浏览器开发）
**排查**：后端 `server.js` 已配置 `cors({ origin: '*' })`

### 错误：401 Unauthorized

**原因**：JWT 过期或无效
**解决**：重新登录获取新 token

### 错误：403 无权限

**原因**：当前账号不是 admin
**解决**：在 Web 后台 → 系统设置 → 创建用户并设置 role=admin

### 错误：404 路由不存在

**原因**：URL 路径写错
**解决**：参考本文档"API 接口清单"部分

### 错误：500 服务器内部错误

**排查**：
```bash
ssh user@server
cd /opt/schedule-admin
docker compose logs -f backend  # 查看后端日志
```

---

## 📋 部署检查清单

部署完成后逐项确认：

```
□ 后端 Web 后台：https://admin.your-domain.com 能打开
□ API 健康检查：https://api.your-domain.com/api/health 返回 success
□ 后台登录：默认 admin / admin123 成功
□ 立即修改默认密码
□ 创建自己的管理员账号并禁用 admin
□ 小程序 config/app.js 已改为 API_BASE_URL
□ 微信公众平台已加 API 域名
□ 小程序重新编译后能登录
□ 小程序首页能加载数据
□ 在 Web 后台改一条数据，小程序刷新能看到
```

---

## 💡 后续维护

| 任务 | 频率 | 操作 |
|------|------|------|
| 数据备份 | 每周 | Web 后台 → 导入导出 → 导出全部 |
| 检查日志 | 每天 | `docker compose logs` 看错误 |
| 更新代码 | 随时 | git push → 自动部署 |
| 添加新账号 | 随时 | Web 后台 → 系统设置 → 账号管理 |
| 修改科室 / 诊室 | 随时 | Web 后台 → 对应管理页 |

---

## 🔐 安全建议

1. **生产环境 JWT_SECRET** 务必用 `openssl rand -base64 48` 生成强随机值
2. **数据库备份** 至少每周一次，存到 OSS/COS
3. **HTTPS 必须** 启用，不要用 HTTP
4. **定期改密码** 至少 90 天一次
5. **限制登录失败次数**（可选）
6. **审计日志** 已自动开启，定期 review

---

**有任何问题？查看 [README.md](README.md) 末尾的「常见问题」或联系开发组。**
