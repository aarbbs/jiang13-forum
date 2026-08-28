# 姜十三论坛 — 多阶段构建：web_src → Go 单二进制 → Alpine 运行镜像
# 不使用 # syntax=docker/dockerfile:1，避免构建前额外拉取 docker.io/docker/dockerfile
#
# 国内网络：默认经 DaoCloud 拉取基础镜像，npm/go 走国内代理
# 海外或已配置 Docker registry-mirrors 时可传空前缀：
#   docker build --build-arg IMAGE_PREFIX= ...

ARG IMAGE_PREFIX=docker.m.daocloud.io/library/
ARG VERSION=dev

# ── Stage 1: SSR 渐进资源（web_src → public/assets）────────────────────────
FROM ${IMAGE_PREFIX}node:22-bookworm-slim AS websrc
WORKDIR /src/web_src
COPY web_src/package.json ./
COPY web_src/ ./
RUN node build.mjs

# ── Stage 2: Go 编译（纯 Go SQLite，CGO_ENABLED=0）────────────────────────
FROM ${IMAGE_PREFIX}golang:1.26-bookworm AS builder
ARG VERSION
ENV GOPROXY=https://goproxy.cn,direct
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=websrc /src/public/assets ./public/assets
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/jiang13 ./cmd/jiang13

# ── Stage 3: 运行镜像 ───────────────────────────────────────────────────────
FROM ${IMAGE_PREFIX}alpine:3.21
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && apk add --no-cache ca-certificates tzdata wget su-exec \
    && adduser -D -u 1000 -h /app jiang13

ENV TZ=Asia/Shanghai

WORKDIR /app
COPY --from=builder /out/jiang13 /app/jiang13
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chown jiang13:jiang13 /app/jiang13 \
    && chmod +x /app/jiang13 /docker-entrypoint.sh

# 以 root 启动，entrypoint 修正 /data 卷权限后 su-exec 降权为 jiang13
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["--work-path", "/app", "--data", "/data", "--port", "3000"]
