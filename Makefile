# 姜十三论坛 Jiang13 Forum - Makefile
# Go 1.26 单二进制编译，与 Gitea 打包方式一致

APP_NAME    := jiang13
MAIN_PKG    := ./cmd/jiang13
BUILD_DIR   := dist
VERSION     := 1.0.0
LDFLAGS     := -s -w -X main.version=$(VERSION)

GO          := go
GOFLAGS     := -trimpath

.PHONY: all build build-windows build-linux build-darwin clean run dev tidy help frontend frontend-build

all: build

frontend-build:
	cd frontend && npm install && npm run build

## 编译当前平台二进制
build: frontend-build
	@mkdir -p $(BUILD_DIR)
	$(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) $(MAIN_PKG)
	@echo "✓ 编译完成: $(BUILD_DIR)/$(APP_NAME)"

## Windows amd64
build-windows:
	@mkdir -p $(BUILD_DIR)
	GOOS=windows GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME).exe $(MAIN_PKG)
	@echo "✓ Windows: $(BUILD_DIR)/$(APP_NAME).exe"

## Linux amd64
build-linux:
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-linux-amd64 $(MAIN_PKG)
	@echo "✓ Linux: $(BUILD_DIR)/$(APP_NAME)-linux-amd64"

## macOS arm64 (Apple Silicon)
build-darwin:
	@mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=arm64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-darwin-arm64 $(MAIN_PKG)
	@echo "✓ macOS: $(BUILD_DIR)/$(APP_NAME)-darwin-arm64"

## 跨平台全量编译
build-all: build-windows build-linux build-darwin build
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

help:
	@echo "姜十三论坛编译命令:"
	@echo "  make build          - 编译当前平台"
	@echo "  make build-windows  - 编译 Windows"
	@echo "  make build-linux    - 编译 Linux"
	@echo "  make build-darwin   - 编译 macOS"
	@echo "  make build-all      - 编译全部平台"
	@echo "  make run            - 仅启动后端（:3000）"
	@echo "  make dev            - 前端热更新开发（:5173 + :3000）"
