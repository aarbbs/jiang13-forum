# 姜十三论坛 Jiang13 Forum - Makefile
# Go 1.26 单二进制：templates SSR + web_src 渐进资源（本分支无 React SPA）

APP_NAME    := jiang13
MAIN_PKG    := ./cmd/jiang13
BUILD_DIR   := dist
DEV_DATA_DIR := dist/data
VERSION     := $(shell git rev-parse --short HEAD 2>/dev/null | sed 's/^/1.0.0+/' || echo 1.0.0)
LDFLAGS     := -s -w -X main.version=$(VERSION)
REGISTRY_IMAGE := hangzhang714128/jiang13-forum

GO          := go
GOFLAGS     := -trimpath

.PHONY: all build build-windows build-linux build-darwin build-all clean run dev tidy help web-src-build docker compose-up compose-down

all: build

web-src-build:
	cd web_src && npm run build

## 编译当前平台二进制（纯 Go SQLite，无需 CGO）
build: web-src-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) $(MAIN_PKG)
	@echo "✓ 编译完成: $(BUILD_DIR)/$(APP_NAME)"

## Windows amd64
build-windows: web-src-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME).exe $(MAIN_PKG)
	@echo "✓ Windows: $(BUILD_DIR)/$(APP_NAME).exe"

## Linux amd64
build-linux: web-src-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-linux-amd64 $(MAIN_PKG)
	@echo "✓ Linux: $(BUILD_DIR)/$(APP_NAME)-linux-amd64"

## macOS arm64 (Apple Silicon)
build-darwin: web-src-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-darwin-arm64 $(MAIN_PKG)
	@echo "✓ macOS: $(BUILD_DIR)/$(APP_NAME)-darwin-arm64"

## 跨平台全量编译（web_src 只跑一次）
build-all: web-src-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME).exe $(MAIN_PKG)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-linux-amd64 $(MAIN_PKG)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-darwin-arm64 $(MAIN_PKG)
	CGO_ENABLED=0 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) $(MAIN_PKG)
	@echo "✓ 全平台编译完成"

## 整理依赖
tidy:
	$(GO) mod tidy

## 本地运行 SSR（先构建 web_src）
run: web-src-build
	@mkdir -p $(DEV_DATA_DIR)
	$(GO) run $(MAIN_PKG) --work-path . --data $(DEV_DATA_DIR)

## 同 run（SPA 对照请 git checkout main）
dev: run

## 清理编译产物
clean:
	rm -rf $(BUILD_DIR)

## 构建 Docker 镜像
docker:
	docker build --build-arg VERSION=$(VERSION) -t $(REGISTRY_IMAGE):$(VERSION) -t $(REGISTRY_IMAGE):latest .

## Docker Compose 启动
compose-up:
	docker compose up -d --build

## Docker Compose 停止
compose-down:
	docker compose down

help:
	@echo "姜十三论坛编译命令 (rebuild/gitea-ssr):"
	@echo "  make web-src-build  - 构建 SSR 渐进资源 (web_src)"
	@echo "  make build          - web_src + 编译当前平台"
	@echo "  make build-windows  - 编译 Windows"
	@echo "  make build-linux    - 编译 Linux"
	@echo "  make build-darwin   - 编译 macOS"
	@echo "  make build-all      - 编译全部平台"
	@echo "  make run / make dev - 启动 SSR（:3000）"
	@echo "  make docker         - 构建 Docker 镜像"
	@echo "  make compose-up     - Docker Compose 启动"
	@echo "  make compose-down   - Docker Compose 停止"
	@echo "  SPA 对照: git checkout main"
