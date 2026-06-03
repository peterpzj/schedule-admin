FROM node:18-alpine

# better-sqlite3 需要 python 和 make
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

# 先拷贝 package.json 利用缓存
COPY package.json ./
RUN npm install --production --registry=https://registry.npmmirror.com

# 拷贝源码
COPY . .

# 创建数据 / 上传目录
RUN mkdir -p data uploads

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

# 启动（生产模式）
ENV NODE_ENV=production
CMD ["node", "server.js"]
