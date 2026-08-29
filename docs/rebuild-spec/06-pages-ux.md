# 06 · 页面、交互与信息架构

> **读者**：实现前台 / 后台 UI 的 AI  
> **前置**：[02-features.md](02-features.md)  
> **源码**：[`frontend/src/App.tsx`](（仅 main）frontend/src/App.tsx)、[`frontend/src/pages/`](（仅 main）frontend/src/pages/)、[`frontend/src/components/`](（仅 main）frontend/src/components/)、[`frontend/src/layouts/`](（仅 main）frontend/src/layouts/)

视觉可重设（见 [10-design-system.md](10-design-system.md)）；**信息架构与关键操作流应对齐**。新站建议 SSR 直出同等信息，而不是先空壳再 fetch。

---

## 1. 路由表

> **本分支（`rebuild/gitea-ssr`）**：浏览器 UI 走 `routers/web` 模板 + 表单，**不依赖**论坛 JSON `/api`。下表「SSR」列表示是否已迁。

### 1.1 认证

| 路径 | 说明 | SSR |
|------|------|-----|
| `/login` | 登录 / 登出 | 已迁 |
| `/register` | 注册（图形验证码；邮件就绪时要邮箱验证码） | 已迁 |
| `/forgot-password` | 忘记密码 | 已迁 |

### 1.2 前台

| 路径 | 说明 | SSR |
|------|------|-----|
| `/` | Feed | 已迁 |
| `/board/:id` | 板块 Feed | 已迁 |
| `/boards` | 板块索引 | 已迁 |
| `/post/:id` | 帖详情 + 评论（回复/赞/私密）/赞/藏 | 已迁 |
| `/compose` | 发帖（类型字段 + Markdown 工具栏/预览/图片/门控） | 已迁 |
| `/post/:id/edit` | 编辑帖 | 已迁 |
| `/profile` | 个人中心（资料/密码/头像/积分钱包） | 已迁 |
| `/user/:id` | 公开用户页 | 已迁 |
| `/favorites` | 收藏 | 已迁 |
| `/projects` | Gitea 码桶 | 后置 |
| `/links` | 友链 | 已迁 |
| `/messages` | 私信/通知会话列表 | 已迁 |
| `/messages/with/:peerId` | 会话详情（peer=0 系统通知） | 已迁 |
| `/page/:slug` | 站点单页 | 已迁 |
| `*` | 404 / pending | 已迁 |

### 1.3 后台（Admin SSR，表单 + CSRF，不挂管理 JSON `/api`）

| 路径 | 说明 | SSR |
|------|------|-----|
| `/admin` | 重定向 dashboard | 已迁 |
| `/admin/dashboard` | 概览计数 | 已迁 |
| `/admin/boards` | 板块 CRUD | 已迁 |
| `/admin/moderation` | 待审帖/评 通过/拒绝 | 已迁 |
| `/admin/settings` | 品牌（含 Logo/Favicon/OG）+ 限流 + 内容限制 + 伪静态 + 敏感词 + SMTP + 备份 | 已迁 |
| `/admin/friend-links` | 品牌友链、申请审核、入口开关 | 已迁 |
| `/admin/pages` | 站点单页 CRUD / 发布 | 已迁 |
| `/admin/reports` | 举报处理 | 已迁 |
| `/admin/users` | 用户列表、禁言、认证、调积分 | 已迁 |
| `/admin/badges` | 徽章定义 CRUD、限定颁发/收回 | 已迁 |
| `/admin/media` | 媒体库分类浏览、删除、同步索引 | 已迁 |
| `/admin/trash` | 帖回收站 | 已迁 |
| `/admin/login` | 重定向前台登录 | 已迁 |

未迁（原 SPA）：OIDC·Gitea·存储热切换 Admin 等。

---

## 2. 三栏布局（桌面）

```text
+------------------+---------------------------+------------------+
| Sidebar          | Feed / 主内容              | RightPanel       |
| - 全部/收藏/码桶 | - FeedHeader / SortBar    | - 签到条(登录)   |
| - 板块列表       | - VirtualPostList         | - 热门帖         |
| - 站点页/友链    | - 或 PostDetail 等        | - aside_widgets  |
| - 管理入口       |                           |   标签云/评论/   |
|                  |                           |   用户/友链      |
+------------------+---------------------------+------------------+
| Footer: ICP / 友链入口 / 站点页链接                              |
+------------------------------------------------------------------+
```

### 2.1 左栏 Sidebar

- 全部帖子、我的收藏（登录）、开源码桶
- 板块列表（图标 + 色点 + 名称）；空站引导「创建第一个板块」
- 站点区：友链入口（`nav_show_friend_links`）、`show_in_nav` 的站点页
- 管理员：管理后台入口

### 2.2 中栏

**Feed**：排序条（最新发帖 / 最新回复 / 热门）+ 搜索面板（关键词、标签、作者、仅标题；已迁 SSR GET）+ 列表项（标题、作者、板块徽章、回复数、置顶/精华）。虚拟滚动 / `feed_list_style` 未迁。

**帖子详情**：标题区操作（赞、藏、举报、编辑、管理操作）→ 待审/被拒横幅（作者/管理员）→ 特殊组件（投票卡 / 悬赏条 / 抽奖卡）→ 正文 `PostContent`（门控块 UI）→ 文章目录 → 作者卡片 → 修订入口 → 评论线程 + 评论框。

### 2.3 右栏 RightPanel

- 登录用户：`AsideCheckInStrip`（签到 + 抽奖 + 积分入口）— **已迁** SSR 右栏；流水/详情仍在 `/profile#wallet`
- 热门帖 — **已迁** SSR（固定块）
- 可配置 widgets：`tag_cloud` / `recent_comments` / `recent_users` / `friend_links`（顺序与开关来自 `aside_widgets`）— **已迁** SSR；Admin `/admin/settings` 侧栏组件开关与排序；友链页 aside 勾选共用同一 JSON
- 桌面三列；≤900px 隐藏右栏

### 2.4 移动端

- 侧栏抽屉化；顶栏搜索/发帖/登录触手可及
- `PullToRefresh` 下拉刷新
- 触控友好列表行高

### 2.5 主题

- 浅色 / 暗色；默认 **跟随系统**（CSS `@media (prefers-color-scheme)`）；`localStorage` 键 `j13-theme`（`system` | `light` | `dark`）
- 显式浅/深时设 `<html data-theme="light|dark">`；`system` 时去掉该属性，交给媒体查询
- 顶栏按钮循环切换；兼容旧 SPA 仅存 `light`/`dark` 的值

---

## 3. 发帖页 Compose

组件：`ComposeHeader`、`ComposeContextBar`（帖类型）、`ComposeSpecialFields`、`ComposeDocument` / `ArticleEditor`。

### 3.1 帖类型切换

| 类型 | 附加 UI |
|------|---------|
| 讨论 | 无 |
| 问答 | 无额外字段（解决状态在详情）— SSR compose 可选；详情切换已迁 |
| 投票 | 选项列表、多选开关、最多可选、截止时间或无截止 |
| 悬赏 | 积分输入（显示余额）— SSR compose；发帖托管 |
| 抽奖 | 中奖人数 1–20 — SSR compose |

### 3.2 编辑器能力（本分支：Markdown 渐进增强）

源对照：[`ArticleEditor.tsx`](（仅 main）frontend/src/components/ArticleEditor.tsx)（TipTap，**不迁**）

| 能力 | SSR 状态 |
|------|----------|
| 标题 h2–h6（`#` 映射为 h2） | Markdown 工具栏 + `ComposeBodyToHTML` |
| 粗体/斜体/删除线/行内代码 | 已迁 |
| 链接 | prompt 插入 |
| 围栏代码块 | 已迁（语言 class） |
| 列表 / 引用 | 已迁 |
| 图片上传 | `/compose/upload` |
| 登录/回复/积分可见门控 | compose 工具栏 |
| 预览 | `POST /compose/preview`（同消毒管线） |
| Tab 缩进 / 未保存离开 | `beforeunload` |
| 表格 / 图片组 / 表情贴纸 / TipTap 双模 | **未做**（后置） |

共用片段：`templates/shared/md_editor.tmpl`（发帖、改帖、评论、改评）。

---

## 4. 帖子详情关键交互

| 模块 | 行为 |
|------|------|
| 门控块 | 锁定壳 UI（长度/价格/引导）；`POST /post/:id/unlock` 返回 inner HTML 后替换 |
| 问答状态 | 已解决/未解决徽章；作者或管理员 `POST /post/:id/question/resolve` 切换 — SSR |
| 投票卡 | 选选项提交；显示百分比；作者可结束 — SSR `/post/:id/poll/vote|close` |
| 悬赏条 | 显示积分与状态；采纳按钮在他人评论上；退款按钮按规则禁用并提示 — SSR `/post/:id/bounty/award|refund` |
| 抽奖卡 | 显示参与人数；开奖；中奖名单 — SSR `/post/:id/lottery/draw` |
| 评论 | 楼层列表、`reply_to` 引用、嵌套树（`ThreadParentID` + 缩进，全局 `#floor`）、私密/赞/举报/编辑/删除、回复/@ 通知 — SSR |
| 修订 | 列表 + 单条快照 — SSR `/post/:id/revisions`（作者/管理员；无 diff） |
| 图片 | Lightbox 查看 |

---

## 5. 消息页

- 左：会话列表（系统会话单独）— SSR `/messages`；快捷链到回复/提及筛选
- 右：消息时间线；发送框 — SSR `/messages/with/:peerId`
- 顶：未读角标（全局导航也可显示）
- 通知筛选（kind）— 系统会话 `?kind=reply|mention|…`

---

## 6. 个人中心 / 公开主页

- 资料编辑、密码、头像直传（**本迭代无裁剪器**）— SSR `/profile`
- 公开页：签名、等级/积分只读、统计、最近帖 — SSR `/user/:id`（无邮箱）
- 收藏列表 — SSR `/favorites`
- 积分钱包面板（余额、近 N 条流水、签到/抽奖表单 PRG）— SSR `/profile`；导航展示当前积分
- 徽章展示：用户主页 / 个人中心 — SSR（访问时 `EvaluateAuto`）

---

## 7. 友链页

- 展示品牌友链 — SSR `/links`
- 登录申请表单：名称、URL、Logo（地址或上传）、是否上首页、回链页 — `POST /links/apply`
- 我的申请状态列表；待审可取消
- Admin：`/admin/friend-links` 品牌增删、申请通过/拒绝、nav/footer/回链检测开关

---

## 8. 管理后台操作流（按页）

| 页 | 关键操作 |
|----|----------|
| Dashboard | 看计数与待办；点进对应列表 |
| Boards | 拖拽或数字排序；图标/色板选择；增删改 |
| Pages | 列表发布开关；编辑正文（HTML textarea）；nav/footer 勾选 — SSR `/admin/pages` |
| Links | 品牌友链增删；申请通过/拒绝/回链复检；回链检测开关；nav/footer/aside 开关 — SSR `/admin/friend-links`（aside 与 Settings 侧栏组件共用 `aside_widgets`） |
| Posts | 审核通过/拒绝 — SSR `/admin/moderation`；置顶/版顶/精华/锁编/锁评/软删 — 帖详情 Admin 条；回收站恢复/清除 — SSR `/admin/trash` |
| Comments | 审核 — SSR `/admin/moderation`；修订查看未迁 |
| Reports | 处理动作：dismiss / resolve / reject_post / reject_comment — SSR `/admin/reports` |
| Users | 搜索；禁言；认证；调积分；设等级 — SSR `/admin/users`（授徽章在 `/admin/badges`） |
| Badges | 定义自动/限定徽章；颁发/收回限定 — SSR `/admin/badges` |
| Media | 分类浏览；单删/批量删；同步索引 — SSR `/admin/media` |
| Media | 分类浏览；批量删 |
| Settings | 品牌（含 Logo/Favicon/OG）、限流、内容限制、伪静态、侧栏、敏感词、邮件、SQLite 备份 — SSR `/admin/settings`（OIDC/Gitea/存储热切换未迁） |

---

## 9. 全局 UX 细节

- Toast（sonner）反馈成功/失败
- 路由级 ErrorBoundary / AppRouteError
- 懒加载页面 + retry（`lazyWithRetry`）
- 新标签打开帖子 / 正文外链：受 `open_posts_in_new_tab`、`open_content_links_in_new_tab` 控制
- 文档标题：`站点名 - 标语`；详情页应换成帖标题（SSR 时首屏即正确）

---

## 10. SSR 重构提示（交互层）

当前 SPA 在客户端挂载后才拉 `/api/posts/:id`。新站应：

1. 服务端渲染列表项与帖文 HTML（已按门控红action）
2. 水合后接上赞/评/解锁等交互
3. 管理后台仍可为 CSR，但前台公开页优先 SSR

勿再维护「爬虫一套 HTML、用户一套空壳」双轨，除非过渡期兼容。
