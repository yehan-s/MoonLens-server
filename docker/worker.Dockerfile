# Worker container for code analysis with zero-persistence
FROM node:18-alpine

# 安装基础工具和分析工具
RUN apk add --no-cache \
    git \
    bash \
    curl \
    ca-certificates \
    python3 \
    py3-pip \
    # 安全扫描工具
    npm \
    && npm install -g \
    eslint \
    @typescript-eslint/parser \
    @typescript-eslint/eslint-plugin \
    prettier \
    # 清理缓存
    && rm -rf /var/cache/apk/* \
    && rm -rf /root/.npm

# 创建非 root 用户
RUN addgroup -g 1000 worker && \
    adduser -D -u 1000 -G worker worker

# 设置工作目录（使用 tmpfs 挂载）
WORKDIR /tmp/work

# 安装 Node.js 分析依赖
COPY package.json* ./
RUN npm ci --only=production && \
    npm cache clean --force

# 复制分析脚本
COPY --chown=worker:worker scripts/analyze.js ./scripts/

# 设置环境变量
ENV NODE_ENV=production \
    MAX_ANALYSIS_TIME=600000 \
    MEMORY_LIMIT=2048 \
    TMPDIR=/tmp/work \
    HOME=/tmp/home

# 创建必要的目录结构
RUN mkdir -p /tmp/work /tmp/home && \
    chown -R worker:worker /tmp

# 切换到非 root 用户
USER worker

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD echo "healthy" || exit 1

# 入口点：执行分析任务
ENTRYPOINT ["node", "scripts/analyze.js"]

# 默认命令
CMD ["--help"]