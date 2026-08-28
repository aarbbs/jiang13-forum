# 07 · 配置、运维与 SEO

> **读者**：部署与运维、以及实现配置层的 AI  
> **前置**：[README.md](README.md)  
> **源码**：[`app.ini.example`](../../app.ini.example)、[`config/`](../../config/)、[`README.md`](../../README.md)、[`handler/seo.go`](../../routers/api/seo.go)、[`handler/seo_bot.go`](../../routers/api/seo_bot.go)、[`embed_static/`](（仅 main 分支）embed_static/)

运维形态可改；下列描述**现网**行为，便于迁移数据与对齐环境变量语义。

---

## 1. 进程配置优先级

**命令行显式参数 > 环境变量 > `app.ini` > 内置默认**

| CLI | 环境变量 | INI | 默认 | 说明 |
|-----|----------|-----|------|------|
| `--port` | `JIANG13_HTTP_PORT` | `[server] HTTP_PORT` | 3000 | 监听端口 |
| `--data` | `JIANG13_DATA` | `[paths] DATA` | `data` | 数据目录 |
| `--jwt-secret` | `JIANG13_JWT_SECRET` | `[security] JWT_SECRET` | 自动生成 | JWT 密钥 |
| `--config` | `JIANG13_CONFIG` | | `{work}/app.ini` | 配置文件路径 |
| `--work-path` | `JIANG13_WORK_PATH` | | 可执行文件目录 | 工作目录 |
| `--service` | | | | install/uninstall/start/stop/restart/status |

`app.ini` 示例见 [`app.ini.example`](../../app.ini.example)。业务配置（邮件、OIDC、Gitea、存储、品牌等）在 **DB `forum_settings`**，管理后台热更新，不必写进 ini。

---

## 2. 数据目录结构

```text
data/
├── jiang13.db              # SQLite 主库
├── jiang13.log             # 运行日志
├── filter_words.txt        # 敏感词
├── .jwt_secret             # 自动生成的 JWT 密钥（勿提交仓库）
├── uploads/
│   ├── avatars/
│   ├── posts/
│   └── site/               # 品牌资源等
└── jiang13_backup_*.db     # 后台导出备份
```

开发时后端常与 `dist/data` 共用，避免 dev 与产物数据分裂（见根 README）。

---

## 3. 部署方式（现网）

| 方式 | 说明 |
|------|------|
| 单二进制 | `build.bat` / `make build` → `dist/jiang13(.exe)` |
| Docker | 镜像挂载 `/data`；健康检查 `GET /health` |
| Compose | `docker compose up -d --build` |
| systemd / Windows Service | `--service install` 后启停 |

构建约定见 [`.cursor/rules/build-scripts.mdc`](../../.cursor/rules/build-scripts.mdc)：Windows 用 `build.bat`，勿直接 `make` / `.\build.ps1`。

容器常用环境变量与上表 `JIANG13_*` 一致。旧镜像权限问题：数据目录属主 uid 1000。

---

## 4. 存储后端

| type | 行为 |
|------|------|
| `local` | 文件落在 `data/uploads`；URL 通常 `/uploads/...` |
| `s3` | S3 兼容；endpoint、bucket、密钥、public_base_url、prefix、force_path_style |

`image_delivery`：`webp`（默认，经 `/media/thumb`）或 `original`。上传始终可保留原图策略以实现为准。

媒体索引表 `media` 供后台列表；启动时可后台 SyncMediaIndex。

---

## 5. SEO / 社交分享字段集合

新站应用真 SSR，但 **meta 字段应对齐**：

| 字段 | 来源 |
|------|------|
| `<title>` | 站点 DocumentTitle 或帖标题 |
| meta description | 站点简介优先，否则标语；帖文则摘要 |
| meta keywords | 站点 keywords |
| canonical | 绝对 URL |
| og:type / site_name / locale / title / description / url / image | |
| twitter:card / title / description / image | |
| JSON-LD | 结构化数据（站点或 Article） |
| robots | 个别页可 noindex（以实现为准） |

### 现网额外机制（可废弃）

| 机制 | 说明 |
|------|------|
| SPA 壳注入 | `embed_static`（仅 `main` 分支） 注入 title / branding JSON，**无帖文 DOM** |
| 爬虫 HTML | User-Agent 命中时 [`seo_bot.go`](../../routers/api/seo_bot.go) 返回简易 HTML |
| robots.txt / sitemap.xml | 动态生成 |

重构验收：用普通浏览器「查看网页源代码」应能看到帖文正文，而不仅是空 div + script。

---

## 6. 伪静态 Permalink

设置：`permalink_enabled`、`permalink_ext`（默认 `html`）。

规范路径示例：

- `/post/123.html`
- `/user/1.html`
- `/board/2.html`
- `/page/about.html`

路由应同时接受无后缀与有后缀形式。解析逻辑见 [`service/permalink.go`](../../services/permalink.go)。

---

## 7. 安全相关运维注意

| 项 | 说明 |
|----|------|
| JWT 密钥 | 生产必须固定且保密；勿提交 `.jwt_secret` |
| Cookie | `jiang13_token` HttpOnly；生产应 Secure + 合适 SameSite |
| 上传 | 类型/大小限制（头像 MB、帖图策略） |
| 敏感词 | 后台可改；影响发帖评论私信等 |
| OAuth 密钥 | 仅存 bcrypt 哈希；创建时明文只回显一次 |
| 备份 | 含用户哈希与私信，下载需管理员权限、传输加密 |

---

## 8. 健康检查

`GET /health` → JSON `status`。Docker / 负载均衡探活依赖此接口；实现应在 DB 不可用时返回非 200。

---

## 9. 从旧站迁数据建议

1. 导出 / 复制 `jiang13.db`（或 dump 到新库并映射表）
2. 复制 `uploads/` 与 `filter_words.txt`
3. 迁移 `forum_settings` 键值（或后台重新配置）
4. 会话：旧 JWT 密钥兼容一阶段，或强制全员重登
5. OIDC 客户端：`oauth_clients` 表 + 重新下发密钥（若无法迁移哈希）

表语义以 [03-data-model.md](03-data-model.md) 为准。

---

## 10. 文档包索引

返回 [README.md](README.md) 阅读顺序；功能验收用 [02-features.md](02-features.md)；规则用 [05-business-rules.md](05-business-rules.md)。
