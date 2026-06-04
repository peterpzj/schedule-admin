# 推送到 GitHub 完整指南

## 当前问题
你的本地 Git 凭据管理器里有一个 PAT，但权限不足（403）。

## 修复方案

### 方案 A：用 GitHub CLI（推荐，最简单）

```bash
# 1. 安装 GitHub CLI（如果还没有）
winget install --id GitHub.cli

# 2. 登录（会打开浏览器授权）
gh auth login
# 选择：GitHub.com → HTTPS → Login with a web browser

# 3. 检查状态
gh auth status

# 4. 测试推送（在 admin/ 目录）
cd admin
git push -u origin main
```

如果 `gh` 已登录，会自动用 gh 的 token 推送。

---

### 方案 B：创建新的 Personal Access Token（PAT）

1. **打开 GitHub 创建 PAT**：
   ```
   https://github.com/settings/tokens/new
   ```

2. **设置**：
   - Note: `schedule-admin-deploy`（随便起个名）
   - Expiration: `90 days`（或 No expiration）
   - **Scopes 必须勾选**：
     - ☑ `repo` (Full control of private repositories) ← **必须有**
   - 其它不用勾

3. **生成后复制 token**（形如 `ghp_xxxxxxxxxxxxxx`）

4. **在 admin 目录推送时**：
   ```bash
   cd admin
   git push -u origin main
   ```
   - 用户名：`peterpzj`
   - 密码：**粘贴刚才的 token**（不是 GitHub 密码！）

5. **Windows 凭据管理器会保存**这个 token，下次自动用。

---

### 方案 C：用 SSH（最稳定）

```bash
# 1. 生成 SSH key
ssh-keygen -t ed25519 -C "peterpanzijing@gmail.com"
# 一路回车

# 2. 复制公钥
cat ~/.ssh/id_ed25519.pub
# 复制输出

# 3. 粘贴到 GitHub
# 打开 https://github.com/settings/ssh/new
# Title: schedule-admin-deploy
# Key: 粘贴上面的公钥
# Add SSH key

# 4. 改用 SSH 远程地址
cd admin
git remote set-url origin git@github.com:peterpzj/schedule-admin.git

# 5. 测试
ssh -T git@github.com
# 应该看到：Hi peterpzj! You've successfully authenticated...

# 6. 推送
git push -u origin main
```

---

## 验证推送

推送成功后到 GitHub 查看：
```
https://github.com/peterpzj/schedule-admin
```

应该看到 56 个文件、README 显示在前台。
