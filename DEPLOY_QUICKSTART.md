# 推送 GitHub + 一键部署 完整指南

> 目标：把 `admin/` 文件夹推到 GitHub 仓库，然后在服务器上一键部署

---

## 🚀 完整流程（4 步）

```
1. GitHub 创建仓库
2. 本地推送代码
3. 服务器上初始化（一行命令）
4. 日常更新（一行命令）
```

---

## 第 1 步：GitHub 创建仓库

1. 打开 https://github.com/new
2. 填写：
   - **Repository name**：`schedule-admin`（或你喜欢的名字）
   - **Description**：`诊室排班管理后台 - Node.js + Vue 3`
   - **Visibility**：Private（私有，避免公开）
   - **Add .gitignore**：None（我们已有）
   - **Add a license**：None
3. 点击 **Create repository**
4. 复制仓库 URL（形如 `https://github.com/你的用户名/schedule-admin.git`）

---

## 第 2 步：本地推送代码

在 `admin/` 目录下执行：

```bash
cd admin

# 初始化 git 仓库
git init
git branch -M main

# 添加所有文件（.gitignore 会自动忽略敏感信息）
git add .

# 首次提交
git commit -m "feat: 诊室排班管理后台首次提交

- 后端：Node.js + Express + SQLite + JWT
- 前端：Vue 3 + Element Plus
- Docker 一键部署
- Excel 导入导出
- 完整 CRUD（8 个实体）"

# 关联远程仓库（替换成你的仓库 URL）
git remote add origin https://github.com/你的用户名/schedule-admin.git

# 推送
git push -u origin main
```

> 💡 **重要**：`.gitignore` 已自动排除 `data/`、`uploads/`、`.env`、`.db` 等敏感/临时文件。

---

## 第 3 步：服务器首次初始化（一行命令）

SSH 登录到你的腾讯云服务器，然后执行：

```bash
# 替换 URL 中的 YOUR_USER
bash <(curl -sSL https://raw.githubusercontent.com/YOUR_USER/schedule-admin/main/bootstrap.sh)
```

> 如果 `bootstrap.sh` 还没推到 GitHub，可以先用 `scp` 上传：
> ```bash
> scp -r admin/ user@your-server:/tmp/schedule-admin-bootstrap
> ssh user@your-server
> bash /tmp/schedule-admin-bootstrap/bootstrap.sh
> ```

脚本会自动完成：

```
✓ [1/8] 更新系统包
✓ [2/8] 安装 curl / git / nginx
✓ [3/8] 安装 Docker + docker compose
✓ [4/8] 克隆仓库到 /opt/schedule-admin
✓ [5/8] 生成 .env（随机 JWT_SECRET + ADMIN_PASSWORD）
✓ [6/8] 创建数据 / 上传目录
✓ [7/8] 构建并启动 Docker 容器
✓ [8/8] 配置防火墙 + 申请 SSL 证书
```

### 脚本运行中的关键交互

| 步骤 | 提示 | 操作 |
|------|------|------|
| 5/8 | 显示默认密码 | **记下来！** 也会保存到 `/tmp/admin_password.txt` |
| 8/8 | SSL 申请 | 自动处理，**但你的域名必须已解析到服务器 IP** |

### 脚本完成后输出

```
==========================================
  ✅ 初始化完成！
==========================================
服务状态：
NAME                    STATUS
schedule-backend         Up
schedule-frontend        Up

访问地址：
  Web 后台:  https://admin.your-domain.com
  API:       https://api.your-domain.com/api
  登录账号:  admin
  登录密码:  AbCd1234XyZ...  (从 /tmp/admin_password.txt)

部署目录: /opt/schedule-admin
查看日志: cd /opt/schedule-admin && docker compose logs -f
==========================================
```

---

## 第 4 步：日常更新（一行命令）

服务器上的代码更新流程：

```bash
# SSH 登录
ssh user@your-server

# 一键更新 + 部署
cd /opt/schedule-admin && ./deploy.sh
```

`deploy.sh` 会自动：

```
✓ [1/5] 拉取最新代码（git pull）
✓ [2/5] 备份数据库（每次自动备份到 data/schedule_YYYYMMDD_HHMMSS.db）
✓ [3/5] 拉取最新镜像
✓ [4/5] 重新构建并启动
✓ [5/5] 健康检查（轮询 10 次）
```

### 常用命令

```bash
cd /opt/schedule-admin

./deploy.sh            # 拉代码 + 重启
./deploy.sh --no-cache # 强制完全重新构建
./deploy.sh --logs     # 部署后实时查看日志

docker compose logs -f            # 全部日志
docker compose logs -f backend    # 仅后端
docker compose restart            # 重启
docker compose down               # 停止
docker compose up -d              # 启动
```

---

## 🔧 在服务器上直接改代码（可选）

如果服务器上没有 `git`，或者你想直接编辑：

```bash
# 用 scp 上传修改
scp admin/backend/server.js user@your-server:/opt/schedule-admin/backend/

# 在服务器上
cd /opt/schedule-admin
./deploy.sh
```

---

## 🌐 完整域名配置（5 分钟）

### 1. DNS 解析

到域名服务商（腾讯云/阿里云）添加 A 记录：

| 主机记录 | 记录类型 | 记录值 |
|----------|----------|--------|
| `api` | A | 你的服务器 IP |
| `admin` | A | 你的服务器 IP |

### 2. 验证 DNS 生效

```bash
nslookup api.your-domain.com
# 应返回你的服务器 IP
```

### 3. 一键 SSL（首次部署时已自动申请）

如果是首次部署 SSL 已自动申请；如果是后续添加新域名：

```bash
sudo certbot --nginx -d api.your-domain.com -d admin.your-domain.com
```

### 4. 自动续期

```bash
# certbot 安装时已自动配置 cron
sudo certbot renew --dry-run  # 测试续期
```

---

## 📦 首次部署必须修改的配置

### .env（自动生成，但你可能想改）

```bash
ssh user@your-server
cd /opt/schedule-admin
nano .env
```

```env
JWT_SECRET=自动生成的安全随机值（不要改）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=首次生成的随机密码（你可以改）
```

### 修改默认密码

1. 浏览器打开 `https://admin.your-domain.com`
2. 用 `admin` + 自动生成的密码登录
3. 进入「系统设置」→「修改密码」
4. 进入「账号管理」→ 创建你自己的账号 → 禁用 `admin`

---

## 🆘 故障排查

### 部署后 Web 后台打不开

```bash
# 1. 检查容器
cd /opt/schedule-admin && docker compose ps

# 2. 查看日志
docker compose logs --tail=50 backend
docker compose logs --tail=50 frontend

# 3. 测试 API
curl -v https://api.your-domain.com/api/health
```

### SSL 证书申请失败

- 检查域名是否解析到本机：`nslookup your-domain.com`
- 检查 80 端口：`sudo netstat -tlnp | grep 80`
- 手动重试：`sudo certbot --nginx -d your-domain.com`

### 数据库锁死

```bash
cd /opt/schedule-admin
docker compose down
# 备份旧库
mv data/schedule.db data/schedule.db.broken
docker compose up -d
# 服务重启后会创建新的空数据库
# 然后用 Web 后台「导入导出」上传你的 Excel 备份
```

### bootstrap.sh 下载失败

国内服务器可能访问 raw.githubusercontent.com 慢，解决方案：

```bash
# 改用国内镜像（替换 URL）
bash <(curl -sSL https://ghproxy.com/https://raw.githubusercontent.com/YOUR_USER/schedule-admin/main/bootstrap.sh)

# 或者先 wget 再执行
wget https://raw.githubusercontent.com/YOUR_USER/schedule-admin/main/bootstrap.sh
bash bootstrap.sh
```

### 微信小程序调用 API 报错

1. **"不在以下 request 合法域名列表中"** → 微信公众平台加 `https://api.your-domain.com`
2. **SSL 错误** → 你的 SSL 证书链不完整，用 SSL Labs 检查
3. **超时** → 检查腾讯云安全组是否放行 443/3000 端口

---

## 📊 部署检查清单

部署完成后逐项确认：

```
□ GitHub 仓库创建并能访问
□ 本地代码推送到 main 分支成功
□ 服务器 bootstrap.sh 完整执行无错误
□ docker compose ps 显示 2 个容器 Up
□ curl https://api.your-domain.com/api/health 返回 200
□ 浏览器打开 https://admin.your-domain.com 显示登录页
□ 用 admin / 自动密码登录成功
□ Web 后台默认显示 3 个院区数据
□ 修改默认密码
□ 创建自己的账号并禁用 admin
□ 微信公众平台添加 API 域名
□ 微信小程序修改 config/app.js 的 API_BASE_URL
□ 小程序登录测试
□ 小程序首页能正常显示数据
□ 在 Web 后台改一条数据，小程序刷新能看到
```

---

## 🔄 完整工作流

```
本地修改代码
  ↓
git add . && git commit -m "..." && git push
  ↓
SSH 服务器
  ↓
cd /opt/schedule-admin && ./deploy.sh
  ↓
自动完成：备份 → 拉取 → 重启 → 验证
  ↓
浏览器打开 https://admin.your-domain.com 验证
  ↓
打开微信小程序验证（无需重新发布，只要重新进入页面）
```

---

**总部署时间**：首次约 30 分钟（含 DNS 解析等待），更新仅 30 秒。
