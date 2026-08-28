# 04 · HTTP API 合约

> **读者**：实现后端 / BFF / 前端数据层的 AI  
> **前置**：[03-data-model.md](03-data-model.md)  
> **源码**：[`router/router.go`](../../routers/setup.go)、[`frontend/src/api/client.ts`](（仅 main）frontend/src/api/client.ts)、[`frontend/src/api/types.ts`](（仅 main）frontend/src/api/types.ts)、[`middleware/auth.go`](../../modules/auth/auth.go)

不要求 OpenAPI YAML；以下表格 + JSON 形状即为合约。新站可加 `/v1` 前缀，但**字段名建议保持**以便对照迁移。

---

## 1. 通用约定

| 项 | 约定 |
|----|------|
| Base | 同源；前端 `credentials: 'same-origin'` |
| 成功 | HTTP 2xx + JSON body |
| 失败 | 非 2xx + `{ "error": "人类可读中文或英文消息" }` |
| 鉴权 | Cookie `jiang13_token`（HttpOnly）；部分也接受 Authorization Bearer（以实现为准） |
| 内容类型 | JSON 默认；部分写接口用 `multipart/form-data`（FormData） |
| OptionalAuth | 有 cookie 则解析用户，无则游客继续 |
| RequireAuth | 必须登录且未禁言 |
| RequireAdmin | 必须 `role=admin` |

### 分页形态差异

| 场景 | 典型字段 |
|------|----------|
| 前台帖列表 | `posts`, `total`, `page`, `size`, `has_more` |
| 后台多数列表 | `total`, `page`, `total_pages` + 实体数组 |
| 私信会话消息 | `before` 游标式 |

---

## 2. 基础设施 / SEO / 静态

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/health` | 无 | `{ "status": "ok" }`（DB ping 失败则非 ok，以实现为准） |
| GET | `/robots.txt` | 无 | 文本 |
| GET | `/sitemap.xml` | 无 | XML |
| GET | `/media/thumb/*filepath` | 无 | 缩略图 / WebP 等 |
| GET | `/uploads/*` | 无 | 静态上传文件 |

---

## 3. OIDC Provider

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/.well-known/openid-configuration` | 无 | Discovery |
| GET | `/oauth/jwks` | 无 | JWKS |
| GET | `/oauth/authorize` | OptionalAuth | 授权码流程 |
| POST | `/oauth/token` | 无（客户端凭证） | 换 token |
| GET/POST | `/oauth/userinfo` | Bearer | 用户信息 |
| GET/POST | `/oauth/logout` | 视实现 | 登出 |

细节以 [`service/oidc.go`](../../services/oidc.go) / [`handler/oidc.go`](../../routers/api/oidc.go) 为准。

---

## 4. 公开 API（`/api` + OptionalAuth）

### 4.1 会话与站点

| 方法 | 路径 | 响应要点 |
|------|------|----------|
| GET | `/api/me` | `{ user: UserSelf \| null }` |
| GET | `/api/stats` | `{ users, posts, boards, comments }` |
| GET | `/api/forum-limits` | `ForumLimitsPublic`（无限流内部字段） |
| GET | `/api/site-branding` | `SiteBranding`（可含 `site_url`） |
| GET | `/api/captcha` | `{ id, image }` image 为 data URL 或 base64 |
| GET | `/api/register/config` | 见下 |

**RegisterConfig**

```json
{
  "is_first_user": true,
  "mail_ready": false,
  "require_email_code": false,
  "register_open": true,
  "email_code_len": 6
}
```

### 4.2 认证（限流）

| 方法 | 路径 | Body | 响应 |
|------|------|------|------|
| POST | `/api/register` | Form: username, password, nickname, email, email_code? | 成功后通常种 cookie |
| POST | `/api/login` | Form: username, password | 种 cookie |
| POST | `/api/register/email-code` | JSON `{ email }` | `{ message }` |
| POST | `/api/password-reset/email-code` | JSON `{ email }` | `{ message }` |
| POST | `/api/password-reset` | JSON `{ email, email_code, new_password }` | `{ message }` |

### 4.3 内容只读

| 方法 | 路径 | Query / 说明 |
|------|------|----------------|
| GET | `/api/boards` | `{ boards: Board[] }` |
| GET | `/api/posts` | 见下表 |
| GET | `/api/posts/hot` | 热门列表 |
| GET | `/api/posts/:id` | `skip_view=1` 可选；返回 `PostDetailResponse` |
| GET | `/api/posts/:id/comments` | `my_ids` 可选（逗号分隔，便于标自己的楼） |
| GET | `/api/tags` | `limit` 默认 40 → `{ tags: [{name,count}] }` |
| GET | `/api/comments/recent` | `{ comments: RecentComment[] }` |
| GET | `/api/users/search` | `q`, `limit` |
| GET | `/api/users/recent` | `{ users: RecentUser[] }` |
| GET | `/api/users/:id` | `{ user: UserPublic, stats }` |
| GET | `/api/pages` | 已发布摘要列表 |
| GET | `/api/pages/:slug` | 单页详情 |
| GET | `/api/projects` | `page`, `limit`, `q` |

**GET `/api/posts` Query**

| 参数 | 说明 |
|------|------|
| page | 默认 1 |
| size | 默认 page_size_default，上限 100 |
| board_id | 0 或不传=全部 |
| user_id | 某用户的帖 |
| keyword | 搜索词 |
| tag | 标签 |
| author | 用户名优先，否则昵称精确匹配 |
| title_only | `1`/`true` 仅搜标题 |
| sort | `latest` \| `reply` \| `hot` |

**响应示例**

```json
{
  "posts": [ /* PostItem */ ],
  "total": 100,
  "page": 1,
  "size": 30,
  "has_more": true
}
```

**PostDetailResponse 要点**

```json
{
  "post": { /* PostItem + content */ },
  "comment_count": 0,
  "liked": false,
  "favorited": false,
  "has_replied": false,
  "can_edit": true,
  "edit_block_reason": "",
  "is_edited": false,
  "post_edit_window_hours": 24,
  "poll": { /* PollView 可选 */ },
  "lottery": { /* PostLotteryView 可选 */ },
  "bounty_can_refund": false,
  "bounty_refund_block_reason": "",
  "bounty_eligible_reply_count": 0
}
```

### 4.4 游客可写评论

| 方法 | 路径 | 限流 | Body |
|------|------|------|------|
| POST | `/api/posts/:id/comments` | comment | Form: content, reply_to?, is_private?, 以及游客字段（以实现为准） |

登录用户发评也走此路径（RequireAuth 组外公开组已注册该路由）。

---

## 5. 需登录 API（`/api` + RequireAuth）

### 5.1 会话与资料

| 方法 | 路径 | Body | 响应 |
|------|------|------|------|
| POST | `/api/logout` | | 清 cookie |
| GET | `/api/favorites` | | `{ favorites, total }` |
| GET | `/api/profile/stats` | | `{ stats: UserActivityStats }` |
| POST | `/api/profile/nickname` | Form nickname | |
| POST | `/api/profile/signature` | Form signature | `{ message, user }` |
| POST | `/api/profile/password` | Form old_password, new_password | |
| POST | `/api/profile/avatar` | Form avatar=file | `{ avatar }` |
| POST | `/api/uploads/image` | Form image=file | `{ url }` |

### 5.2 帖子写操作

| 方法 | 路径 | Body | 响应 |
|------|------|------|------|
| POST | `/api/posts` | Form: board_id, title, content, tags?, post_type?, poll_options?, bounty_points?, lottery_winner_count? | `{ message, post_id, status }` |
| PUT | `/api/posts/:id` | Form: title, content, tags?, board_id?, post_type? | `{ message }` |
| DELETE | `/api/posts/:id` | | 软删 |
| GET | `/api/posts/:id/revisions` | | `{ revisions }` |
| GET | `/api/posts/:id/revisions/:revId` | | `{ revision }` |
| POST | `/api/posts/:id/like` | | `{ liked, like_count }` |
| POST | `/api/posts/:id/favorite` | | `{ favorited }` |
| POST | `/api/posts/:id/resolve` | Form resolved=`1`\|`0` | `{ question_resolved }` |
| POST | `/api/posts/:id/poll/vote` | JSON `{ option_ids: number[] }` | `{ poll }` |
| POST | `/api/posts/:id/poll/close` | | `{ poll }` |
| POST | `/api/posts/:id/bounty/award` | Form comment_id | |
| POST | `/api/posts/:id/bounty/refund` | | |
| POST | `/api/posts/:id/lottery/draw` | | `{ lottery }` |
| POST | `/api/posts/:id/report` | JSON `{ reason, detail? }` | `{ report }` |
| POST | `/api/posts/:id/unlock` | JSON `{ block_key }` | 见下 |

**poll_options JSON 示例**（Form 字段字符串）

```json
{
  "multi": false,
  "max_choices": 1,
  "ends_at": "2026-09-01T12:00:00Z",
  "options": [{ "text": "选项A" }, { "text": "选项B" }]
}
```

**unlock 响应**

```json
{
  "message": "...",
  "unlock": {
    "block_key": "abcdef0123456789",
    "cost": 10,
    "points_balance": 90,
    "inner_html": "<p>...</p>"
  }
}
```

### 5.3 评论写操作

| 方法 | 路径 | Body |
|------|------|------|
| POST | `/api/comments/:id/like` | → `{ liked, like_count }` |
| POST | `/api/comments/:id/report` | JSON `{ reason, detail? }` |
| PUT | `/api/comments/:id` | Form content |
| DELETE | `/api/comments/:id` | |

### 5.4 私信

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/messages/unread-count` | `{ count, dm_count?, notify_count? }` |
| GET | `/api/messages/notifications` | page, size, kind |
| POST | `/api/messages/notifications/read` | |
| GET | `/api/messages/conversations` | page, size |
| GET | `/api/messages/conversations/:peerId` | size, before；peerId=0 为系统 |
| POST | `/api/messages/conversations/:peerId/read` | |
| POST | `/api/messages` | JSON `{ to_user_id, subject?, content }` |
| POST | `/api/messages/read-all` | |

### 5.5 经济

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/me/points` | page；含 ledger、check_in、lottery |
| GET/POST | `/api/me/check-in` | 状态 / 执行签到 |
| GET/POST | `/api/me/lottery` | 状态 / 抽奖 |

### 5.6 友链申请

| 方法 | 路径 | Body |
|------|------|------|
| POST | `/api/friend-links/apply` | JSON name, url, logo, link_on_homepage, reciprocal_page_url? |
| POST | `/api/friend-links/logo` | Form logo=file → `{ url }` |
| GET | `/api/friend-links/my-applies` | |
| PUT | `/api/friend-links/applies/:id` | 同申请字段 |
| DELETE | `/api/friend-links/applies/:id` | 取消 |

---

## 6. 管理 API（`/api/admin` + Auth + Admin）

### 6.1 仪表盘与设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/dashboard` | AdminDashboard |
| GET | `/settings` | AdminSettings 聚合 |
| PUT | `/settings/forum` | ForumLimits |
| PUT | `/settings/mail` | MailConfig |
| POST | `/settings/mail/test` | `{ to }` |
| PUT | `/settings/oidc` | OIDCConfig |
| PUT | `/settings/gitea` | GiteaSyncConfig |
| POST | `/settings/gitea/sync` | 手动同步 |
| PUT | `/settings/storage` | StorageConfig |
| PUT | `/settings/branding` | SiteBranding |
| POST | `/settings/branding/upload` | Form kind=`logo`\|`favicon`\|`og_image`, file |
| POST | `/settings/branding/clear` | JSON `{ kind }` |
| GET/PUT | `/settings/filter-words` | GET 读；PUT `{ content }` |

（上表路径均相对于 `/api/admin`。）

### 6.2 OAuth 客户端

| 方法 | 路径 |
|------|------|
| GET/POST | `/oauth/clients` |
| PUT/DELETE | `/oauth/clients/:id` |

创建/更新 body：`name`, `redirect_uris`, `client_id?`, `enabled?`, `client_secret?`, `rotate_secret?`。

### 6.3 板块 / 单页 / 友链

| 方法 | 路径 |
|------|------|
| POST/PUT/DELETE | `/boards`, `/boards/:id` |
| GET/POST | `/pages` |
| GET/PUT/DELETE | `/pages/:id` |
| PUT | `/pages/:id/published` → `{ published }` |
| GET | `/friend-link-applies` |
| PUT | `/friend-link-settings` |
| POST | `/friend-link-applies/:id/approve` \| `reject` \| `recheck` |

### 6.4 帖子审核与运营

| 方法 | 路径 | Body |
|------|------|------|
| GET | `/posts` | page, keyword, status |
| GET | `/posts/trash` | |
| POST | `/posts/:id/pin` | `{ pinned }` |
| POST | `/posts/:id/board-pin` | `{ board_pinned }` |
| POST | `/posts/:id/feature` | `{ featured }` |
| POST | `/posts/:id/lock` | `{ locked }` → edit_locked |
| POST | `/posts/:id/comments-lock` | `{ locked }` |
| POST | `/posts/:id/approve` | |
| POST | `/posts/:id/reject` | `{ reason }` |
| POST | `/posts/:id/restore` | |
| DELETE | `/posts/:id/purge` | 硬删 |
| DELETE | `/posts/:id` | 软删 |

### 6.5 评论 / 举报 / 用户 / 徽章 / 媒体 / 备份

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/comments`, `/comments/trash` | |
| GET | `/comments/:id/revisions` | |
| POST | `/comments/:id/approve` \| `reject` \| `restore` | reject 可带 reason |
| DELETE | `/comments/:id`, `/comments/:id/purge` | |
| GET | `/reports` | page, status |
| POST | `/reports/:id/handle` | `{ action, handle_note?, reject_reason? }`；action=`dismiss`\|`resolve`\|`reject_post`\|`reject_comment` |
| GET | `/users` | page, keyword, filter |
| POST | `/users/:id/ban` | `{ banned }` |
| POST | `/users/:id/verify` | `{ verified }` |
| POST | `/users/:id/level` | `{ level }` |
| POST | `/users/:id/points` | `{ delta, note? }` |
| POST | `/users/:id/badges` | `{ badge_id, revoke? }` |
| GET/POST | `/badges` | 列表 / upsert |
| GET | `/media` | category, page, size, q |
| POST | `/media/delete` | `{ urls: string[] }` |
| POST | `/backup` | `{ filename, download }` |
| GET | `/backup/download/:name` | 文件下载 |

---

## 7. 核心类型速查（与前端对齐）

详见 [`frontend/src/api/types.ts`](（仅 main）frontend/src/api/types.ts)。实现时至少对齐：

- `User` / `UserPublic` / `UserActivityStats`
- `Board` / `PostItem` / `PostDetailResponse` / `Comment`
- `ForumLimits` / `ForumLimitsPublic` / `SiteBranding`
- `PollView` / `PostLotteryView`
- `PrivateMessage` / `MessageConversation`
- `PostReport` / `FriendLinkApply` / `BadgeDef` / `PointLedger`
- `CheckInStatus` / `LotteryStatus`
- `AdminDashboard` / `AdminSettings` / `StorageConfig` / `MailConfig` / `OIDCConfig`

---

## 8. 鉴权错误语义（现网）

中间件对未登录 / 过期 / 禁言返回 JSON error（并可能清 cookie）。前端统一 `throw new Error(data.error)`。新站应保持可区分的错误文案或错误码，避免前端无法提示。

源：[`middleware/auth.go`](../../modules/auth/auth.go)。
