# 08 · Gitea 式 SSR 架构（开发约定）

> **读者**：在本仓库 `rebuild/gitea-ssr` 分支上开发的 AI / 开发者  
> **前置**：[README.md](README.md)  
> **对照上游**：[go-gitea/gitea](https://github.com/go-gitea/gitea)

---

## 目标栈（已确认）

| 层 | 选择 |
|----|------|
| 公开页渲染 | Go `html/template` **真 SSR** |
| 浏览器写操作 | `routers/web` HTML 表单 POST + CSRF + PRG |
| JSON `/api` | **仅机器客户端**（OIDC 等）；不服务已迁页面 UI |
| 渐进增强 | `web_src/` → `public/assets/` → `/ssr-assets/` |
| 发布 | 单二进制 + `go:embed` |
| 业务语义 | `01`–`07`；冲突时改代码并回写规格 |
| 不做 | React SPA、爬虫/用户双轨 HTML、为旧 SPA 保留死代码 |

---

## 分支

| 分支 | 用途 |
|------|------|
| `main` | React SPA 对照（git checkout / worktree） |
| `rebuild/gitea-ssr` | 唯一重建分支 |

---

## 目录

```text
routers/
  setup.go
  install/       # INSTALL_LOCK 未置位时的安装向导
  web/           # HTML + 表单
  api/           # 精简机器接口（health / OIDC / robots / sitemap / media）
modules/
  webctx/        # Doer / CSRF / Flash / HTML / Redirect
  auth/
  webrender/
  seo/
templates/
  install.tmpl
  post-install.tmpl
  base/ home/ post/ shared/ status/ auth/ admin/ profile/ user/ favorites/ messages/
services/
web_src/ → public/assets/
```

**已删除：** `frontend/`、`embed_static/`、`ServePublicSPA`、爬虫双轨 HTML、首注册变管理员 bootstrap、`app.ini`、浏览器 JWT Cookie 登录。

**配置：** 引导 = CLI/Env（含 `DB_*`）；运行时 = `forum_settings` 热更；`.jwt_secret` = App HMAC；OIDC PEM 启用时进 settings。详见 [07-config-ops.md](07-config-ops.md)。

**会话：** Cookie `jiang13_session` → 表 `sessions`；可吊销。

**数据库：** GORM 方言 `sqlite`（默认）| `postgres` | `mysql`；连库失败不回落。

**后置：** Gitea 仓库同步（不启后台任务）。

---

## 安装

- 锁文件：`data/install.lock`
- 未安装：除 `/install`、`/ssr-assets/*`、`/health` 外一律重定向到安装向导
- 管理员仅由安装向导创建；已有用户数据启动时会自动补写锁
- 向导不选库：库由启动 Env 决定

---

## 渲染与交互原则

1. 已迁路径「查看源代码」须含内容 DOM。
2. UI 读写不依赖 `/api` 灌首屏或写操作（`/compose/upload` 为同站表单辅助 JSON，带 CSRF）。
3. 模板默认转义；`safeHTML` 仅用于消毒 + 门控后正文/评论 HTML。
4. 未迁路径用 `status/pending.tmpl` 或 404，不维护 SPA 占位语义。
5. 会话 Cookie：`jiang13_session`；`SameSite=Lax`；HTTPS 下 `Secure`。

### 已迁路径（摘要）

公开写：`/install`、`/login`、`/logout`、`/register`、`/forgot-password`（发码/重置）、`/compose`（含门控插入）、`/post/:id/edit`、帖详情评论（reply_to/赞/私密）/赞/藏、评论赞、积分解锁 `POST /post/:id/unlock`。

个人闭环：`/profile`（昵称/签名/密码/头像、积分钱包/签到/抽奖）、`/user/:id`、`/favorites`。
`POST /profile/checkin`、`POST /profile/lottery`（CSRF + PRG）。

私信：`/messages`、`/messages/with/:peerId`（系统 peer=0 只读；打开会话标已读）。

公开浏览：`/boards` 板块索引（链到 `/board/:id`）。

Feed 搜索：`/` / `/board/:id` 面板（`keyword` / `tag` / `author` / `title_only`）；排序与分页 URL 保参；顶栏链到 `/#search`。

右栏：首页与帖详情三栏；固定热门帖 + `aside_widgets`（标签云 / 最新评论 / 最新用户 / 友链）；Admin 友链页可开关侧栏友链。

友链：`/links`（列表、登录申请/取消、Logo 上传）；Admin `/admin/friend-links`（品牌增删、审核、nav/footer/aside 入口开关）。

Admin：`/admin/dashboard`、`/admin/boards`、`/admin/moderation`、`/admin/settings`（品牌/限流/敏感词/SMTP）、`/admin/friend-links`。