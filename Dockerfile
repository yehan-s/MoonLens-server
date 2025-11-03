# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY prisma ./prisma

# 安装依赖
RUN npm ci
# 生成 Prisma Client（编译期需要类型）
RUN npx prisma generate

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY prisma ./prisma

# 只安装生产依赖
RUN npm ci --only=production && npx prisma generate

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "dist/src/main.js"]
