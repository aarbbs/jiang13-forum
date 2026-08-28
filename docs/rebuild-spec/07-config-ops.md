# 07 · 配置、运维与 SEO

> **读者**：部署与运维、以及实现配置层的 AI  
> **前置**：[README.md](README.md)  
> **源码**：[`config/`](../../config/)、[`README.md`](../../README.md)、[`routers/api/seo.go`](../../routers/api/seo.go)、[`routers/install/`](../../routers/install/)

运维形态可改；下列描述**本分支**行为。

---

## 0. 首次安装（Gitea 式）

| 项 | 说明 |
|----|------|
| 锁文件 | `data/install.lock` |
| 向导 | `GET/POST /install`（`templates/install.tmpl`） |
| 未锁定 | 除 `/install`、`/ssr-assets/*`、`/health` 外重定向到向导 |
| 管理员 | 仅安装向导创建；不再「首个注册用户变管理员」 |
| 向导内容 | 站点名 + 管理员账号（数据库已在进程启动时连上） |
| 旧数据 | 启动时若已有用户且无锁，自动补写锁 |

**无 `app.ini`。** 引导仅 CLI / Env。

---

## 1. 配置分层与重启边界

| 层 | 存什么 | 变更方式 | 需重启 |
|----|--------|----------|--------|
| **Bootstrap** | `DATA`、`HTTP_PORT`/`ADDR`、`DB_TYPE` + DSN/连接参数、工作目录 | CLI / Env | **是** |
| **密钥文件** | App HMAC（`data/.jwt_secret`，文件名历史遗留）；OIDC RSA **仅启用时**写入 settings（可选遗留文件迁移） | 自动生成 | HMAC 换钥需重启 |
| **站点运行时** | 品牌、邮件、OIDC 开关、限流、敏感词、存储、伪静态… | DB `forum_settings` | **否**（热更） |

**优先级：** 命令行显式参数 > 环境变量 > 内置默认。

### 进程引导

| CLI | 环境变量 | 默认 | 说明 |
|-----|----------|------|------|
| `--port` | `JIANG13_HTTP_PORT` | 3000 | 监听端口 |
| `--http-addr` | `JIANG13_HTTP_ADDR` | （空=全接口） | 监听地址 |
| `--data` | `JIANG13_DATA` | `data` | 数据目录 |
| `--work-path` | `JIANG13_WORK_PATH` | 可执行文件目录 | 工作目录 |
| `--db-type` | `JIANG13_DB_TYPE` | `sqlite` | `sqlite` \| `postgres` \| `mysql` |
| `--db-dsn` | `JIANG13_DB_DSN` | （sqlite 默认 `{DATA}/jiang13.db`） | 完整 DSN，优先 |
| `--db-host` 等 | `JIANG13_DB_HOST` / `USER` / `PASS` / `NAME` / `SSLMODE` | | DSN 为空时拼接（pg/mysql） |
| `--service` | | | install/uninstall/start/stop/restart/status |

`{DATA}/.jwt_secret`：**App HMAC 密钥**（CSRF 双提交等），启动时自动生成。**不是**浏览器登录 JWT。`--config` / `--jwt-secret` / `JIANG13_JWT_SECRET` 已废弃。

浏览器登录：DB `sessions` + Cookie `jiang13_session`。OIDC 对外 token 仍为 JWT，私钥在 `forum_settings.oidc_rsa_private_pem`（启用时懒加载；未启用不生成 `.oidc_rsa.pem`）。

业务配置（邮件、OIDC、存储、品牌、敏感词等）在 **DB `forum_settings`**，管理后台热更新。

### 数据库 Env 示例

**SQLite（默认）：**

```bash
JIANG13_DATA=/data
# 可不设 DB_*；库文件 = $JIANG13_DATA/jiang13.db
```

**PostgreSQL：**

```bash
JIANG13_DB_TYPE=postgres
JIANG13_DB_DSN="postgres://forum:secret@db:5432/jiang13?sslmode=disable"
# 或拆分：
# JIANG13_DB_HOST=db:5432
# JIANG13_DB_USER=forum
# JIANG13_DB_PASS=secret
# JIANG13_DB_NAME=jiang13
# JIANG13_DB_SSLMODE=disable
```

**MySQL / MariaDB：**

```bash
JIANG13_DB_TYPE=mysql
JIANG13_DB_DSN="forum:secret@tcp(db:3306)/jiang13?parseTime=true&loc=Local&charset=utf8mb4"
```

连库失败时进程**退出并打印 Env 提示**，不会静默回落 sqlite。

### Docker Compose 多库示意

```yaml
services:
  jiang13:
    image: hangzhang714128/jiang13-forum:latest
    environment:
      JIANG13_DB_TYPE: postgres
      JIANG13_DB_DSN: postgres://forum:secret@postgres:5432/jiang13?sslmode=disable
    volumes:
      - jiang13-data:/data
    depends_on: [postgres]
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: forum
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: jiang13
```

---

## 2. 数据目录结构

```text
data/
├── install.lock            # 安装完成锁（与 DB 引擎无关）
├── jiang13.db              # 仅 SQLite 时的主库文件（含 sessions / forum_settings）
├── jiang13.log             # 运行日志
├── filter_words.txt        # 遗留：启动时可导入 settings；新源以 DB 为准
├── .jwt_secret             # App HMAC（CSRF 等；勿提交；非登录 JWT）
├── .oidc_rsa.pem           # 遗留：仅启用 OIDC 且从文件迁移时可能存在；新站优先 DB
├── uploads/
│   ├── avatars/
│   ├── posts/
│   └── site/
└── jiang13_backup_*.db     # SQLite 一键备份（其它引擎请用库方工具）
```

---

## 3. 部署方式（现网）

| 方式 | 说明 |
|------|------|
| 单二进制 | `build.bat` / `make build` → `dist/jiang13(.exe)` |
| Docker | 镜像挂载 `/data`；健康检查 `GET /health` |
| Compose | `docker compose up -d --build` |
| systemd / Windows Service | `--service install` 后启停 |

构建约定见 [`.cursor/rules/build-scripts.mdc`](../../.cursor/rules/build-scripts.mdc)：Windows 用 `build.bat`，勿直接 `make` / `.\build.ps1`。

---

## 4. 存储后端

| type | 行为 |
|------|------|
| `local` | 文件落在 `data/uploads`；URL 通常 `/uploads/...` |
| `s3` | S3 兼容；endpoint、bucket、密钥、public_base_url、prefix、force_path_style |

`image_delivery`：`webp`（默认，经 `/media/thumb`）或 `original`。

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
| og:* / twitter:* | |
| JSON-LD | 结构化数据 |
| robots | 个别页可 noindex |

| 机制 | 说明 |
|------|------|
| robots.txt / sitemap.xml | 动态生成 |

重构验收：普通浏览器「查看网页源代码」应能看到帖文正文。

---

## 6. 伪静态 Permalink

设置：`permalink_enabled`、`permalink_ext`（默认 `html`）。

---

## 7. 安全相关运维注意

| 项 | 说明 |
|----|------|
| HMAC / OIDC | 勿提交 `.jwt_secret`；OIDC PEM 优先在 DB；遗留 `.oidc_rsa.pem` 亦勿提交 |
| Cookie | `jiang13_session` HttpOnly + SameSite=Lax；生产 HTTPS 下 Secure |
| 上传 | 类型/大小限制 |
| 敏感词 | `forum_settings.filter_words`，后台可改热更 |
| 备份 | SQLite 文件备份含哈希与私信；PG/MySQL 用官方工具 |

---

## 8. 健康检查

`GET /health` → JSON `status`。DB 不可用时非 200。

---

## 9. 从旧站迁数据建议

1. SQLite：复制 `jiang13.db`；或 dump 到 PG/MySQL 并映射表  
2. 复制 `uploads/`、`.jwt_secret`（HMAC 兼容）；敏感词若仍在文件可启动导入  
3. 迁移 `forum_settings` 或后台重配（含 `filter_words`）  
4. OIDC：`oauth_clients` + settings 中 PEM（或遗留 `.oidc_rsa.pem` 一次迁移）  
5. 旧站 JWT Cookie 无效；用户需重新登录（opaque session）

表语义以 [03-data-model.md](03-data-model.md) 为准。

---

## 10. 文档包索引

返回 [README.md](README.md) 阅读顺序；功能验收用 [02-features.md](02-features.md)；规则用 [05-business-rules.md](05-business-rules.md)。
