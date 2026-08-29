# 02 · 功能清单（验收级）

> **读者**：实现与验收  
> **前置**：[01-product.md](01-product.md)  
> **交叉**：[05-business-rules.md](05-business-rules.md)、[06-pages-ux.md](06-pages-ux.md)  
> **源码对照**：[`frontend/src/App.tsx`](（仅 main）frontend/src/App.tsx)、[`router/router.go`](../../routers/setup.go)、[`README.md`](../../README.md)

用复选框做验收；重构完成时应全部可勾选（或书面声明砍掉的功能）。

---

## A. 浏览与布局

- [x] 三栏布局：左导航 / 中 Feed / 右栏小组件 — SSR（桌面；≤900px 隐藏右栏）
- [ ] 浅色 / 暗色主题；跟随系统偏好并本地记忆
- [ ] 响应式：平板/手机收起侧栏
- [ ] 长列表虚拟滚动或等价流畅方案
- [x] Feed 排序：`latest`（最新发帖）/ `reply`（最新回复）/ `hot`（热门）
- [x] 板块筛选：全部 + 单板块
- [ ] 列表样式可配：`title` | `excerpt` | `thumbnail`
- [x] 搜索：关键词、标签、作者、仅标题（`title_only`）— SSR Feed 面板（`/` / `/board/:id`）
- [x] 右栏：热门帖、标签云、最新评论、最新用户、友链（可开关排序）— SSR 热门固定 + `aside_widgets`；Admin `/admin/settings` 侧栏组件编辑器
- [x] 登录用户右栏/侧边：签到与抽奖入口 — SSR 右栏条（钱包详情仍在 `/profile#wallet`）
- [ ] 下拉刷新（移动端）
- [ ] 可选伪静态：`/post/123.html` 等形式（后缀后台可配）
- [x] 404 页

---

## B. 认证与个人中心

- [x] 注册（用户名、密码、昵称、邮箱；可选邮箱验证码）— SSR `/register`
- [x] 图形验证码接口（注册流程）— SSR 注册页强制；`GET /api/captcha` + `POST /api/register` 校验
- [x] 登录 / 登出（opaque session Cookie `jiang13_session`）— SSR；SameSite=Lax；登出/禁言/改密吊销
- [x] 忘记密码：邮箱验证码 + 重置 — SSR `/forgot-password`（依赖 SMTP 就绪）
- [x] 注册配置：邮件就绪时强制验证码；安装后开放注册（不依赖 SMTP）
- [x] ~~首个用户自动成为管理员~~ → 改为仅 `/install` 创建管理员
- [x] 个人中心：改昵称、签名、密码、上传头像、积分钱包/签到/抽奖 — SSR `/profile`（裁剪未做）
- [x] 个人活动统计：帖数、评数、收藏数、获赞 — `/profile` + `/user/:id`
- [x] 公开用户主页 `/user/:id`（无邮箱）
- [x] 禁言用户无法使用需登录写接口（中间件 + compose 门控）

---

## C. 板块

- [x] 列出板块（含帖数等展示字段）— SSR `/boards` + 侧栏 + Admin
- [x] 管理员：创建 / 改 / 删板块 — SSR `/admin/boards`
- [x] 板块名称、描述、图标、色板索引、排序
- [x] 默认板块保障（空站可引导创建）

---

## D. 帖子（通用）

- [x] 发帖：选板块、标题、标签、正文 — SSR `/compose`（normal）
- [x] 正文图片上传 — `/compose/upload` + Markdown 插入
- [ ] TipTap 富文本能力（见 [06-pages-ux.md](06-pages-ux.md) 编辑器节）— 本分支改用 Markdown textarea 渐进增强
- [ ] Markdown 编辑模式（与富文本互转/双模）
- [x] 编辑帖子（时限、锁帖约束）— SSR `/post/:id/edit`
- [x] 删除帖子 → 软删进回收站 — SSR Admin（帖详情 + `/admin/trash`）
- [x] 修订历史列表与单条详情（可做 diff）— SSR `/post/:id/revisions`（作者/管理员；无 diff）
- [x] 点赞切换；收藏切换；收藏列表 — SSR `/favorites`
- [x] 浏览量 — 详情页计数
- [x] 举报帖子 — SSR 表单 + `/admin/reports`
- [x] 内容审核状态展示（作者可见待审/被拒）— SSR 帖详情横幅 + 评论楼层标签

### D.1 帖子类型

- [x] `normal` 普通讨论 — SSR compose 默认
- [x] `question` 问答：可标记已解决 / 未解决 — SSR compose + 详情徽章与切换
- [x] `poll` 投票：2–10 选项；单选/多选；可选截止时间；投票；作者可结束 — SSR compose + 详情卡
- [x] `bounty` 悬赏：发帖托管积分；采纳评论发奖；可退款（规则见 05）— SSR compose + 详情条 + award/refund
- [x] `lottery` 抽奖帖：设定中奖人数；从评论参与者开奖 — SSR compose + 详情卡 + draw

### D.2 运营标记（管理员）

- [x] 全局置顶 / 取消 — SSR 帖详情
- [x] 版内置顶 / 取消（仅板块列表抬升）— SSR 帖详情
- [x] 精华 / 取消 — SSR 帖详情
- [x] 禁止编辑（edit lock）— SSR 帖详情
- [x] 禁止评论 / 结贴（comments lock）— SSR 帖详情
- [x] 审核通过 / 拒绝（拒绝可通知作者）— SSR `/admin/moderation`
- [x] 回收站：恢复 / 彻底删除 — SSR `/admin/trash`

---

## E. 内容门控

- [x] 编辑器可插入「登录可见」块 — compose 工具栏
- [x] 编辑器可插入「回复可见」块 — compose 工具栏
- [x] 编辑器可插入「积分可见」块（可设价格）— compose 工具栏 + prompt
- [x] 未登录：遮盖 members-only 与 reply-only 正文，保留长度提示 — 锁定壳 UI
- [x] 已登录未回复：遮盖 reply-only（作者与管理员始终可见）
- [x] 积分块：未解锁遮盖；`POST /post/:id/unlock` 扣积分并返回 inner HTML
- [x] 搜索 / SEO 出口对门控内容做红action，不泄露正文（既有）

---

## F. 评论

- [x] 按帖拉取评论列表（楼层、引用目标）— SSR 帖详情；扁平列表 + `reply_to` 展示（嵌套树 UI 未做）
- [x] 发表评论（登录）；支持 `reply_to`、私密评论 — `POST /post/:id/comments`
- [ ] 游客评论（公开接口可写，字段 guest_*）
- [x] 编辑评论（时限）；删除评论 — SSR 帖详情入口 + `/comments/:cid/edit|delete`；作者软删进回收站
- [x] 评论点赞 — `POST /post/:id/comments/:cid/like`
- [x] 评论举报 — SSR
- [x] @ 提及 → 通知 — SSR 发评/审通调用 `NotifyCommentMentions`
- [x] 回复提醒（站内信 + 可选邮件）— SSR 发评/审通调用 `NotifyCommentPublished`
- [x] 审核中 / 被拒评论可见性规则 — 服务层已有；SSR 楼层标签（作者/管理员）
- [x] 管理员：通过 / 拒绝待审评论 — SSR `/admin/moderation`（回收站/修订未迁）

---

## G. 私信与通知

- [x] 会话列表（含系统会话 peer=0）— SSR `/messages`
- [x] 会话消息（分页 / before 游标）— SSR `/messages/with/:peerId`
- [x] 发送私信 — 表单 PRG；用户主页「发私信」入口
- [x] 未读数（可分私信 / 通知）— 列表分项 + 导航角标
- [x] 标记会话已读 / 通知已读 / 全部已读 — 打开会话自动已读；全部标已读
- [x] 系统通知种类：`system` / `reject` / `report_result` / `reply` / `mention` / `moderation` 等（写入已有；`/messages/with/0?kind=` 筛选）

---

## H. 积分、签到、抽奖、徽章、等级

- [x] 积分流水查询 — SSR `/profile` 钱包近 N 条
- [x] 每日签到：基础 5，连签每日 +1，封顶 15 — `POST /profile/checkin`
- [x] 每日抽奖：奖池加权（0/2/5/10/20），成本 0 — `POST /profile/lottery`
- [x] 积分解锁分成：读者付全额，作者约 70% — 门控 unlock 服务
- [ ] 短龄同 IP 互刷拒绝分成
- [ ] Exp → 等级 Lv1–10
- [ ] 自动徽章（注册天数 / 获赞 / 创作分成）— 种子定义 + `EvaluateAuto` 已有；Admin 可改定义，独立调度 UI 未做
- [x] 限定徽章：管理员定义与授予/撤销 — SSR `/admin/badges`
- [x] 管理员调整积分、设定认证（免审）— SSR `/admin/users`（等级设定 UI 未做，仅只读展示 Lv）

---

## I. 友链

- [x] 前台友链页；导航/页脚入口可配 — SSR `/links`；`nav_show_friend_links` / `footer_show_friend_links`
- [x] 用户申请（名称、URL、Logo、是否上首页、回链页）— `POST /links/apply`
- [x] Logo 上传 — 表单 multipart 或 `POST /links/logo`
- [x] 我的申请列表；取消待审 — `/links`（修改待审：取消后重提）
- [x] 管理员审核：通过 / 拒绝 / 回链复检 — SSR `/admin/friend-links`（创建时可异步检测）
- [x] 管理员维护品牌友链列表 — `/admin/friend-links` 增删

---

## J. 站点单页

- [x] 公开：`/page/:slug` 列表入口（nav/footer）— SSR
- [x] 管理员 CRUD；发布开关；排序；nav/footer 展示开关 — SSR `/admin/pages`

---

## K. Gitea 码桶（**后置**）

> 本迭代**不做**产品化同步：不启后台定时任务、不挂管理入口。表结构与 settings 键可保留兼容。

- [ ] （后置）后台开关、Base URL、Token、同步间隔
- [ ] （后置）手动同步 + 后台定时同步
- [ ] （后置）前台 `/projects` 列表与搜索

---

## L. OIDC Provider

- [ ] Discovery、JWKS、Authorize、Token、UserInfo、Logout
- [ ] 多 OAuth 客户端 CRUD；密钥哈希存储；PKCE 字段支持
- [ ] groups claim 映射 admin/user 组

---

## M. 媒体与存储

- [ ] 本地 uploads 或 S3 兼容存储（可热切换配置）— 后端已支持；Admin 热切换 UI 未迁
- [x] 头像 / 帖图 / 站点品牌资源分类 — 上传路径 + Admin 分类筛选
- [ ] 图片展示可选 WebP 转换（`/media/thumb/...`）— 路由已有；全站默认策略未产品化
- [x] 管理后台媒体列表与删除 — SSR `/admin/media`
- [x] 媒体索引表同步 — 启动扫盘 + Admin「同步索引」

---

## N. 管理后台其它

- [x] 仪表盘：用户/帖/板块计数 + 待审帖/评 + 待处理举报 — SSR `/admin/dashboard`
- [x] 敏感词：`forum_settings.filter_words` 读写 + 热更 — SSR `/admin/settings`
- [x] 基础限流（post/comment/register/login/window）— SSR；完整 Limits 字数等未迁
- [x] SMTP 配置与测试信 — SSR `/admin/settings` 邮件区
- [x] 站点品牌文案：名称、标语、简介、keywords、Logo 字标、ICP — SSR（Logo/Favicon/OG 上传未迁）
- [x] SQLite 一键备份与下载 — SSR `/admin/settings`（仅 sqlite；写入 data 目录后下载）

---

## O. 基础设施

- [x] `GET /health` — `routers/setup.go`
- [x] `robots.txt` / `sitemap.xml` — SSR 同源路径
- [x] 静态上传文件可达 — `Static /uploads` → data/uploads
- [x] 限流：发帖、注册、登录、举报、私信、友链 — SSR 写路径已挂 `RateLimiter`（评论动作键服务层有、web 发评尚未挂，可后补）

---

## 明确不在当前规格内（计划中可后做）

摘自 [`ROADMAP.md`](../../ROADMAP.md)，**不是**现网必交验收项：

- 通知动态 UX 大幅优化
- 帖子搜索增强（组合筛选更强）

若新站一并实现，可作为加分项，不阻塞「功能对等」验收。
