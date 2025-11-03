# 简化版 Worker 容器，用于代码分析
FROM node:18-alpine

# 安装基础工具
RUN apk add --no-cache git bash curl

# 创建工作目录
WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1000 worker && \
    adduser -D -u 1000 -G worker worker

# 创建分析脚本
RUN echo '#!/usr/bin/env node' > /app/analyze.js && \
    echo 'console.log("MoonLens Worker - Code Analysis");' >> /app/analyze.js && \
    echo 'console.log("Task:", process.argv[2] || "none");' >> /app/analyze.js && \
    echo 'process.exit(0);' >> /app/analyze.js && \
    chmod +x /app/analyze.js

# 设置权限
RUN chown -R worker:worker /app

# 切换到非 root 用户
USER worker

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
    CMD echo "healthy" || exit 1

# 入口点
ENTRYPOINT ["node", "/app/analyze.js"]
