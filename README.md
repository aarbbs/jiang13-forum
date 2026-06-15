# 姜十三论坛 Jiang13 Forum

轻量自用论坛系统，面向小圈子内部交流。与 Gitea 相同，编译为**单个独立 Go 二进制**，前端静态资源 embed 内嵌，内置 SQLite，开箱即用。

## 项目目录结构

```
js13-forum/
├── cmd/jiang13/main.go          # 程序入口
├── config/config.go             # 命令行参数与配置
├── model/
│   ├── models.go                # GORM 模型定义
│   └── db.go                    # 数据库初始化与自动迁移
├── service/                     # 业务逻辑层
│   ├── auth.go                  # 注册/登录/JWT
│   ├── user.go                  # 用户资料/头像
│   ├── board.go                 # 板块 CRUD
│   ├── post.go                  # 帖子/点赞/收藏
│   ├── comment.go               # 楼层评论
│   ├── backup.go                # SQLite 备份
│   ├── ratelimit.go             # 访问限流
│   └── common.go                # 敏感词过滤等
├── handler/
│   ├── handlers.go              # 前台页面与 API
│   └── admin.go                 # 后台管理
├── middleware/auth.go           # JWT 鉴权与限流中间件
├── router/router.go             # 路由注册
├── embed_static/
│   ├── embed.go                 # go:embed 声明
│   ├── static/css/style.css     # 内嵌 CSS
│   ├── static/js/app.js         # 内嵌 JS
│   └── templates/               # 内嵌 HTML 模板
├── go.mod
├── Makefile
└── README.md
```

## 快速开始

### 1. 编译

**Windows（推荐，无需 GNU Make）：**

```powershell
# PowerShell
.\build.ps1

# 或双击 / cmd
build.bat
```

**Linux / macOS（需 GNU Make）：**

```bash
make build
```

**手动分步（全平台通用）：**

```bash
cd frontend && npm install && npm run build
cd .. && go build -trimpath -ldflags "-s -w" -o dist/jiang13.exe ./cmd/jiang13
```

> Windows 自带的 `make` 通常是 Embarcadero MAKE，**不能**识别本项目 Makefile。请用 `.\build.ps1` 或安装 GNU Make（`choco install make`）后再用 `make build`。

跨平台编译：

```powershell
.\build.ps1 -Target build-windows
.\build.ps1 -Target build-linux
.\build.ps1 -Target build-all
```

### 2. 启动

```bash
# Windows
.\dist\jiang13.exe --port 3000 --data ./data

# Linux / macOS
./dist/jiang13 --port 3000 --data ./data
```

### 3. 首次使用

1. 浏览器打开 http://localhost:3000/register 注册账号
2. **第一个注册的用户自动成为管理员**，无需额外命令
3. 登录后可访问 http://localhost:3000/admin/dashboard 进入后台

## 启动参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--port` | 3000 | HTTP 监听端口 |
| `--data` | ./data | 数据目录（SQLite、上传、日志） |
| `--jwt-secret` | 自动生成 | JWT 签名密钥（留空则自动生成并持久化到 data/.jwt_secret） |

## 数据目录说明

```
data/
├── jiang13.db              # SQLite 主数据库
├── jiang13.log             # 运行日志
├── filter_words.txt        # 敏感词配置（可编辑）
├── .jwt_secret             # JWT 密钥（自动生成）
├── uploads/avatars/        # 用户头像（运行时写入，非 embed）
└── jiang13_backup_*.db     # 后台导出的备份文件
```

## 修改前端并重新打包（Gitea 同款流程）

1. 编辑 `embed_static/templates/` 下的 HTML 模板
2. 编辑 `embed_static/static/css/` 或 `static/js/` 下的静态资源
3. 重新编译：`make build`
4. 替换旧二进制，重启服务

前端资源通过 `//go:embed` 编译进二进制，**运行时不需要单独的前端文件夹**。只有用户上传的头像保存在 `--data` 目录。

```go
// embed_static/embed.go
//go:embed static/*
var staticFS embed.FS

//go:embed templates/*
var templatesFS embed.FS
```

## 功能概览

- 用户注册/登录（bcrypt + JWT Cookie）
- 普通用户 / 管理员两级权限
- 板块管理、发帖、富文本 HTML、标签、置顶
- 楼层式评论，支持回复指定楼层
- 点赞、收藏
- 管理员：删帖、删评论、禁言、SQLite 备份
- 内置敏感词过滤、发帖/评论限流

## 技术栈

- **后端**：Go 1.26 + Gin + GORM + SQLite
- **前端**：React 18 + Arco Design + TanStack Virtual（虚拟滚动）
- **打包**：Vite 构建 → `go:embed` 内嵌 SPA，与 Gitea 同款单二进制

## 前端开发（热更新 HMR）

日常改前端**不需要**重新 `npm run build` 或 `go build`，用 Vite 开发服务器即可秒级热更新：

```bash
# 一键启动：Go 后端 + Vite 热更新（推荐）
.\build.ps1 -Target dev          # Windows
make dev                         # Linux / macOS（需 GNU Make）

# 浏览器访问 http://localhost:5173
# API 自动代理到 http://localhost:3000
```

也可开两个终端分别启动：

```bash
# 终端 1：仅后端
.\build.ps1 -Target run          # 或 make run

# 终端 2：仅前端热更新
cd frontend && npm install && npm run dev
```

**何时才需要完整构建：**

- 改 Go 代码、模板、embed 静态资源 → `go build` / `make build`
- 发布单二进制前 → `npm run build` + `make build`（前端产物写入 `embed_static/static/spa/` 后 embed 进二进制）

> 若直接访问 `:3000`，看到的是**上次 build 嵌入**的前端，不会有热更新。开发时请用 `:5173`。

### 前端特性（高密度 V2EX/NGA 风格）

| 特性 | 实现 |
|------|------|
| 三栏布局 | 左栏板块菜单（可折叠）+ 中间虚拟滚动帖列表 + 右栏热门/通知/在线 |
| 虚拟滚动 | `@tanstack/react-virtual` 帖列表 & 楼层回复 |
| 已读/未读 | 未读高亮 + 角标 + 批量标记已读 |
| 主题 | 浅色/暗黑一键切换，平板/手机自动收起侧栏 |
| 交互 | 滚动加载更多、快捷回帖、楼层锚点、引用回复、@高亮 |

## 许可证

MIT — 自用随意，欢迎修改。
