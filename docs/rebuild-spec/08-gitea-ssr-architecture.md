# 08 · Gitea 式 SSR 架构（开发约定）

> **读者**：在本仓库 `rebuild/gitea-ssr` 分支上开发的 AI / 开发者  
> **前置**：[README.md](README.md)  
> **对照上游**：[go-gitea/gitea](https://github.com/go-gitea/gitea)

---

## 目标栈（已确认）

| 层 | 选择 |
|----|------|
| 公开页渲染 | Go `html/template` **真 SSR**（完整 HTML，含帖文/列表 DOM） |
| 渐进增强 | `web_src/` 少量 CSS/JS，构建后嵌入 |
| 发布 | 单二进制 + `go:embed` |
| 业务语义 | 仍以本目录 `01`–`07` 为准 |
| 不做 | React/Next 公开页 SPA；用户与爬虫双轨 HTML |

---

## 开发分支与对照

| 分支 | 用途 |
|------|------|
| `main` | 现网 **React SPA** 对照，勿在此做破坏性 SSR 替换 |
| `rebuild/gitea-ssr` | **唯一** Gitea 式重构开发分支 |

对照运行：

```bash
git checkout main          # 旧 SPA
# 或
git worktree add ../jiang13-spa main
```

---

## 目录职责（本分支已落地）

```text
cmd/jiang13/         # 入口
config/              # 配置
models/              # GORM 模型（原 model/）
services/            # 业务逻辑（原 service/）
routers/
  setup.go           # 路由总装（原 router/）
  web/               # HTML SSR
  api/               # JSON API（原 handler/）
modules/
  auth/              # JWT / 限流等（原 middleware/）
  webrender/         # 模板渲染
  seo/               # PageMeta 等
templates/           # Go 模板（embed）
web_src/             # CSS/JS 源码
public/assets/       # 构建产物（URL 前缀 `/ssr-assets/`）
docs/rebuild-spec/   # 产品规格
.cursor/rules/       # AI 开发规则
```

**已删除（勿恢复）：** `frontend/`、`embed_static/`。SPA 对照仅看 `main`。

---

## 渲染原则

1. 用户访问已迁移路径时，「查看源代码」须可见内容 DOM，而非空壳。
2. JSON `/api` 留给交互增强与后台；**不得**作为公开页首屏唯一数据来源。
3. 模板默认 HTML 转义；可信 HTML（已消毒正文）用明确的安全管道，禁止随意 `| safe`。
