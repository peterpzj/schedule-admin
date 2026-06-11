# JWT 密钥轮换 SOP

> 适用：schedule-admin 后端（Express + better-sqlite3）

## 为什么需要轮换

- 单密钥永久使用存在泄露风险（CI 日志、运维误操作、历史备份等）
- 一次性强制所有用户重新登录体验差，且有雪崩风险
- 平滑轮换 = 服务端支持新旧密钥并行验签，旧 token 自然过期

## 原理

- token payload 增加 kv（key version）字段
- 签发：用 current 密钥 + kv=1
- 验签：根据 token 的 kv 字段选 current（kv=1）或 previous（kv=0）
- 不匹配直接拒绝（防被吊销的旧密钥继续验签）

## 流程（5 步，每步 24h 观察期）

### 步骤 0：准备工作

```bash
# 在服务器上生成新密钥
openssl rand -base64 48
# 输出形如：aBc123XyZ... (>= 32 字符的随机字符串)
```

### 步骤 1：预热（生成新密钥但还没启用）

```bash
# 编辑 .env，把新密钥写入 JWT_SECRET_NEW
nano /opt/schedule-admin/.env
# 追加：
# JWT_SECRET_NEW=<新生成的密钥>
```

重启服务后，进程会 warn 提示检测到 JWT_SECRET_NEW，但不会立刻用于签发。
回滚方式：清空 JWT_SECRET_NEW 后重启。

### 步骤 2：启用（current 切到 new，旧的降级为 previous）

```bash
# 1) 把当前 CURRENT 备份到 PREVIOUS
# 2) 把 NEW 改名为 CURRENT
# 3) 保留 PREVIOUS 留作验签
# 4) 清空 NEW
# 5) 重启
sed -i 's/^JWT_SECRET_CURRENT=.*/JWT_SECRET_CURRENT=<new>/' /opt/schedule-admin/.env
sed -i 's/^JWT_SECRET_PREVIOUS=.*/JWT_SECRET_PREVIOUS=<old_current>/' /opt/schedule-admin/.env
sed -i '/^JWT_SECRET_NEW=/d' /opt/schedule-admin/.env
cd /opt/schedule-admin && docker compose restart backend
```

观察期：建议 24 小时。期间用户无感知（继续用旧 token 访问）。

### 步骤 3：清理（旧 token 自然过期后）

```bash
# 等到大部分用户已重新登录（24-48h），清理 PREVIOUS
sed -i '/^JWT_SECRET_PREVIOUS=/d' /opt/schedule-admin/.env
cd /opt/schedule-admin && docker compose restart backend
```

### 步骤 4：验证

```bash
# 1) 健康检查
curl https://api.your-domain.com/api/health
# 期望：jwtSecretOk=true

# 2) 额外校验 previous 是否加载
node -e "const s = require('/opt/schedule-admin/backend/middleware/secret'); \
  const r = s.resolveSecret(); \
  console.log('current kv:', r.current.kv, 'len:', r.current.value.length); \
  console.log('previous:', r.previous ? 'loaded (kv='+r.previous.kv+', len='+r.previous.value.length+')' : 'none');"
```

## 应急回滚

如果在步骤 2 发现问题（用户大面积 401、API 错误率飙升）：

```bash
# 把 CURRENT 切回旧密钥，NEW 清空
sed -i 's/^JWT_SECRET_CURRENT=.*/JWT_SECRET_CURRENT=<old_current>/' /opt/schedule-admin/.env
sed -i '/^JWT_SECRET_NEW=/d' /opt/schedule-admin/.env
cd /opt/schedule-admin && docker compose restart backend
```

## 监控

建议在告警系统里加上：

- error_code = JWT_SECRET_INVALID：启动失败（配置错误）
- error_code = AUTH_TOKEN_INVALID：单次请求验签失败（> 1% 触发告警，可能说明 previous 已过期太久）

## 安全注意

- 密钥绝不能进 git（.env 必须在 .gitignore）
- CI/部署脚本中传入密钥用 Secret，不要 echo 到日志
- 定期（建议 90 天）做一次轮换
- 发生安全事件（运维离职、服务器被入侵）时立刻轮换，无需观察期
