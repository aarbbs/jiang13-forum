# 06 · 页面、交互与信息架构

> **读者**：实现前台 / 后台 UI 的 AI  
> **前置**：[02-features.md](02-features.md)  
> **源码**：[`frontend/src/App.tsx`](../../frontend/src/App.tsx)、[`frontend/src/pages/`](../../frontend/src/pages/)、[`frontend/src/components/`](../../frontend/src/components/)、[`frontend/src/layouts/`](../../frontend/src/layouts/)

视觉可重设；**信息架构与关键操作流应对齐**。新站建议 SSR 直出同等信息，而不是先空壳再 fetch。

---

## 1. 路由表

### 1.1 认证（无 MainLayout 壳或独立简洁壳）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/login` | LoginPage | |
| `/register` | RegisterPage | 读 register/config；可能关闭 |
| `/forgot-password` | ForgotPasswordPage | 依赖邮件 |

### 1.2 前台（MainLayout）

| 路径 | 页面 |
|------|------|
| `/` | HomePage（全部 Feed） |
| `/board/:id` | HomePage（板块 Feed；id 可带伪静态后缀） |
| `/post/:id` | PostDetailPage |
| `/compose` | ComposePage 发帖 |
| `/post/:id/edit` | ComposePage 编辑 |
| `/profile` | ProfilePage（需登录） |
| `/user/:id` | UserProfilePage |
| `/favorites` | FavoritesPage |
| `/projects` | ProjectsPage（Gitea 码桶） |
| `/links` | LinksPage |
| `/messages` | MessagesPage |
| `/page/:slug` | SitePageView |
| `*` | NotFoundPage |

重定向：`/boards` → `/admin/boards`。

### 1.3 后台（AdminLayout，需管理员）

| 路径 | 页面 |
|------|------|
| `/admin` → `/admin/dashboard` | 仪表盘 |
| `/admin/boards` | 板块管理 |
| `/admin/pages` | 单页列表 |
| `/admin/pages/new`、`/admin/pages/:id/edit` | 单页编辑 |
| `/admin/links` | 友链与申请 |
| `/admin/posts` | 帖子审核/运营 |
| `/admin/comments` | 评论 |
| `/admin/reports` | 举报 |
| `/admin/users` | 用户 |
| `/admin/badges` | 徽章定义 |
| `/admin/media` | 媒体 |
| `/admin/settings` | 系统设置（多 Tab） |

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

**Feed**：排序条（最新发帖 / 最新回复 / 热门）+ 搜索面板（关键词、标签、作者、仅标题）+ 虚拟列表项（标题、作者、板块徽章、标签、回复数、最后回复、置顶/精华标记）。列表样式随 `feed_list_style`。

**帖子详情**：标题区操作（赞、藏、举报、编辑、管理操作）→ 特殊组件（投票卡 / 悬赏条 / 抽奖卡）→ 正文 `PostContent`（门控块 UI）→ 文章目录 → 作者卡片 → 修订入口 → 评论线程 + 评论框。

### 2.3 右栏 RightPanel

- 登录用户：`AsideCheckInStrip`（签到 + 抽奖 + 积分入口）
- 热门帖
- 可配置 widgets：`tag_cloud` / `recent_comments` / `recent_users` / `friend_links`（顺序与开关来自 settings）

### 2.4 移动端

- 侧栏抽屉化；顶栏搜索/发帖/登录触手可及
- `PullToRefresh` 下拉刷新
- 触控友好列表行高

### 2.5 主题

- 浅色 / 暗色；`localStorage` 记忆；可跟随系统

---

## 3. 发帖页 Compose

组件：`ComposeHeader`、`ComposeContextBar`（帖类型）、`ComposeSpecialFields`、`ComposeDocument` / `ArticleEditor`。

### 3.1 帖类型切换

| 类型 | 附加 UI |
|------|---------|
| 讨论 | 无 |
| 问答 | 无额外字段（解决状态在详情） |
| 投票 | 选项列表、多选开关、最多可选、截止时间或无截止 |
| 悬赏 | 积分输入（显示余额） |
| 抽奖 | 中奖人数 1–20 |

### 3.2 编辑器能力（应对齐）

源：[`ArticleEditor.tsx`](../../frontend/src/components/ArticleEditor.tsx) 与 `editor/` 扩展

- 标题 h2–h6（无 h1，避免与帖标题冲突）
- 粗体/斜体/删除线等基础标记
- 链接对话框
- 代码块（语言、选项对话框）
- 表格插入/编辑
- 图片上传 + 图片组布局 + 浮动/清除浮动
- 表情 / 贴纸选择器（多套：bilibili/douyin/tieba/weibo 等静态资源）
- **登录可见** / **回复可见** / **积分可见**（价格 1–9999）节点
- 富文本 ↔ Markdown 双模（门控块有 markdown 约定，见 [`utils/markdownContent.ts`](../../frontend/src/utils/markdownContent.ts)）
- Tab 缩进

未保存离开：`UnsavedChangesDialog`。

---

## 4. 帖子详情关键交互

| 模块 | 行为 |
|------|------|
| 门控块 | 锁定态显示长度/价格；解锁按钮调 API 后替换 inner HTML |
| 投票卡 | 选选项提交；显示百分比；作者可结束 |
| 悬赏条 | 显示积分与状态；采纳按钮在他人评论上；退款按钮按规则禁用并提示 |
| 抽奖卡 | 显示参与人数；开奖；中奖名单 |
| 评论 | 楼层列表、回复、引用、私密开关、@ 用户搜索、点赞、编辑、举报 |
| 修订 | 面板列出历史，可选对比 |
| 图片 | Lightbox 查看 |

---

## 5. 消息页

- 左：会话列表（系统会话单独）
- 右：消息时间线；发送框
- 顶：未读角标（全局导航也可显示）
- 通知筛选（kind）

---

## 6. 个人中心 / 公开主页

- 资料编辑、头像裁剪、密码
- 积分钱包面板（流水、签到状态）
- 徽章与等级徽记展示
- 公开页：签名、徽章、统计、最近帖（按现实现）

---

## 7. 友链页

- 展示已通过/品牌友链
- 「申请友链」对话框：名称、URL、Logo 上传、是否上首页、回链页 URL
- 我的申请状态列表

---

## 8. 管理后台操作流（按页）

| 页 | 关键操作 |
|----|----------|
| Dashboard | 看计数与待办；点进对应列表 |
| Boards | 拖拽或数字排序；图标/色板选择；增删改 |
| Pages | 列表发布开关；进编辑器写正文；nav/footer 勾选 |
| Links | 品牌友链 CRUD；申请队列通过/拒绝/复检；回链检测开关；nav/footer/aside 开关 |
| Posts | 按状态筛；通过/拒绝；置顶/版顶/精华/锁编/锁评；进回收站恢复/清除 |
| Comments | 审核；修订查看；回收站 |
| Reports | 处理动作四选一 |
| Users | 搜索；禁言；认证；设等级；调积分；授徽章 |
| Badges | 定义自动/限定徽章 |
| Media | 分类浏览；批量删 |
| Settings | Tab：论坛限制、侧栏组件、伪静态、邮件、OIDC+客户端、Gitea、存储、品牌、敏感词、备份 |

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
