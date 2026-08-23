# 姜十三论坛 Jiang13 Forum - Makefile
# Go 1.26 单二进制编译，与 Gitea 打包方式一致

APP_NAME    := jiang13
MAIN_PKG    := ./cmd/jiang13
BUILD_DIR   := dist
VERSION     := 1.0.0
LDFLAGS     := -s -w -X main.version=$(VERSION)
REGISTRY_IMAGE := hangzhang714128/jiang13-forum

GO          := go
GOFLAGS     := -trimpath

.PHONY: all build build-windows build-linux build-darwin clean run dev tidy help frontend frontend-build docker compose-up compose-down

all: build

frontend-build:
	cd frontend && npm install && npm run build

## 编译当前平台二进制（纯 Go SQLite，无需 CGO）
build: frontend-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) $(MAIN_PKG)
	@echo "✓ 编译完成: $(BUILD_DIR)/$(APP_NAME)"

## Windows amd64（先打包前端再 embed）
build-windows: frontend-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME).exe $(MAIN_PKG)
	@echo "✓ Windows: $(BUILD_DIR)/$(APP_NAME).exe"

## Linux amd64（先打包前端再 embed）
build-linux: frontend-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-linux-amd64 $(MAIN_PKG)
	@echo "✓ Linux: $(BUILD_DIR)/$(APP_NAME)-linux-amd64"

## macOS arm64 (Apple Silicon)（先打包前端再 embed）
build-darwin: frontend-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-darwin-arm64 $(MAIN_PKG)
	@echo "✓ macOS: $(BUILD_DIR)/$(APP_NAME)-darwin-arm64"

## 跨平台全量编译（frontend-build 只跑一次）
build-all: frontend-build
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME).exe $(MAIN_PKG)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-linux-amd64 $(MAIN_PKG)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-darwin-arm64 $(MAIN_PKG)
	CGO_ENABLED=0 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) $(MAIN_PKG)
	@echo "✓ 全平台编译完成"

## 整理依赖
tidy:
	$(GO) mod tidy

## 本地运行（仅后端，使用已 embed 的前端）
run:
	$(GO) run $(MAIN_PKG)

## 前端热更新开发（后端 :3000 + Vite :5173，Ctrl+C 同时退出）
dev:
	@echo "前端热更新: http://localhost:5173"
	@echo "后端 API  : http://localhost:3000"
	@trap 'kill 0' INT; \
	$(GO) run $(MAIN_PKG) & \
	cd frontend && (test -d node_modules || npm install) && npm run dev

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
	@echo "姜十三论坛编译命令:"
	@echo "  make build          - 编译当前平台"
	@echo "  make build-windows  - 编译 Windows"
	@echo "  make build-linux    - 编译 Linux"
	@echo "  make build-darwin   - 编译 macOS"
	@echo "  make build-all      - 编译全部平台"
	@echo "  make run            - 仅启动后端（:3000）"
	@echo "  make dev            - 前端热更新开发（:5173 + :3000）"
	@echo "  make docker         - 构建 Docker 镜像"
	@echo "  make compose-up     - Docker Compose 启动"
	@echo "  make compose-down   - Docker Compose 停止"
