# =============================================================
# 多阶段构建 - schedule-admin-backend
# Stage 1: deps    - 安装生产依赖（含 better-sqlite3 原生编译）
# Stage 2: test    - 跑 vitest 集成测试（可选触发）
# Stage 3: runtime - 仅拷贝必要产物运行
# =============================================================

# ---------- Stage 1: deps ----------
FROM node:18-alpine AS deps

# better-sqlite3 原生模块需要 python + make + g++
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

# 拷贝 package 描述 + .npmrc（用国内镜像加速）
COPY package.json package-lock.json* ./
# 全部依赖（含 devDependencies）— vitest / supertest 在 test 阶段用
RUN npm install --registry=https://registry.npmmirror.com
# 不 prune！deps stage 仍需保留 devDeps 给 test stage 复用

# 把 devDeps 单独 cp 一份留待 test 阶段
RUN cp -r /app/node_modules /tmp/node_modules_full
RUN cp /app/package.json /tmp/package.json

# ---------- Stage 2: test ----------
# #P0-6 测试基建：在镜像构建时跑集成测试，失败即 exit 1 → CI 红
# 单独 stage 避免污染 runtime 镜像（test 阶段需要的 vitest/supertest 仅 devDeps 里有）
FROM node:18-alpine AS test

RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

COPY --from=deps /tmp/node_modules_full ./node_modules
COPY --from=deps /tmp/package.json ./package.json
COPY server.js ./
COPY routes ./routes
COPY middleware ./middleware
COPY lib ./lib
COPY db ./db
COPY test ./test
COPY .env.test ./
COPY vitest.config.js ./

# 跑集成测试
RUN npm test || (echo 'TESTS FAILED' && exit 1)

# ---------- Stage 3: runtime ----------
FROM node:18-alpine AS runtime

# wget 已在 base 镜像，用于 HEALTHCHECK
RUN apk add --no-cache wget tini

# 创建一个非 root 用户运行 node 进程
RUN addgroup -S app -g 1001 \
    && adduser -S app -u 1001 -G app

WORKDIR /app

# 从 deps 阶段拷贝 node_modules 和源代码
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json ./
COPY --chown=app:app server.js ./
COPY --chown=app:app routes ./routes
COPY --chown=app:app middleware ./middleware
COPY --chown=app:app lib ./lib
COPY --chown=app:app db ./db
COPY --chown=app:app scripts ./scripts

# 数据/上传目录
RUN mkdir -p data uploads \
    && chown -R app:app data uploads

# 切到非 root 用户
USER app

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

ENV NODE_ENV=production

# tini 作为 PID 1，负责转发信号 + 回收僵尸进程
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]