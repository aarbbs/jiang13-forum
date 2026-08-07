# 刷新无闪烁优化方案

> **目标**：消除浏览器刷新时的视觉闪烁，让刷新体验接近 Gitea（内容未变化时肉眼完全感知不到重绘）。

---

## 一、根因分析

### Gitea 为什么「无闪烁」

Gitea 是 **服务端渲染（SSR）的 MPA**，浏览器收到的 HTML 响应中**已经包含完整渲染的内容**（帖子、列表、评论）。刷新时：
1. 浏览器从服务器取回**已填好内容**的 HTML（非空壳）
2. 一次性解析 → 布局 → 绘制，内容直接到位
3. 浏览器原生 scrollRestoration 在同一帧恢复滚动位置
4. **没有任何骨架 → 内容的切换**，整页只发生**一次** paint

### jiang13-forum 当前刷新的视觉路径

作为 **React SPA**，刷新时会经历以下可见的阶段（全部可被肉眼察觉）：

| 阶段 | 触发者 | 视觉 | 持续时间 |
|---|---|---|---|
| ① 空白 → 顶栏布局出现 | `index.html` 内联 CSS + React 挂载顶栏 | 三栏骨架先出现，但中间主内容区为空 | ~50-150ms |
| ② 路由 Suspense fallback | `lazyWithRetry` + `App.tsx` 中 `<Suspense>` | `FeedPageSkeleton` 骨架（首页）或 `PageLoader` 转圈（其他页）进入主内容区 | ~50-100ms |
| ③ 数据 loading 骨架 | 各页面组件 `setLoading(true)` → 早期 return 骨架/转圈 | 鱼骨骨架 / Spinner 可见 | ~100-400ms（网络请求） |
| ④ 骨架 → 真实内容切换 | 数据返回后 `setLoading(false)` | 骨架消失，真实内容瞬间出现，**出现明显跳变** | 瞬时 |
| ⑤ 滚动位置恢复（延迟） | `useScrollRestoration` → rAF 循环等内容高度足够 | 先看到内容在 scrollTop=0，然后才跳到目标位置，**可见的先顶后跳** | 内容渲染后 ~0-4 帧 |

用户所说的"虽然不会回到顶部再恢复滚动的情况，但基本全都有刷新"，指的是阶段 ① ~ ④ 的可见变化：骨架出现、骨架消失、内容到位，这是**多次 paint 的切换闪烁**；而阶段 ⑤ 先顶后跳可能被掩盖但仍存在。

### 核心问题

- 首页 `HomePage`：刷新后内存 `feedCache` 丢失，`posts.length === 0`，L239 条件命中 → `FeedPageSkeleton` 骨架可见 → 数据回来后切到真实内容 → 闪烁。
- 帖子详情 `PostDetailPage`：`loading=true` 时 L446 命中 → `<Spinner size="lg" />` 居中转圈 → 数据回来后切到真实内容 → 闪烁。
- 其他页面（消息、收藏、个人主页、后台各页）：均有 `loading ? <Spinner ... />` 早期 return → 闪烁。
- 滚动恢复晚于内容首 paint：内容先在顶部画出来，下一帧才跳回目标位置 → 先顶后跳的闪烁（虽然比之前回顶再跳好很多，但仍可感知）。

---

## 二、总体策略

采用 **三层防御** 分层消除闪烁：

1. **S0 层 — 首屏内容预缓存（sessionStorage 级）**
   - 仿照 `feedCache.ts` 的结构，将**上次渲染的真实内容**（posts 列表、post 详情 + 评论、其他轻量列表数据）在 `pagehide` 时持久化到 sessionStorage。
   - 刷新首帧用 sessionStorage 中的旧数据**直接渲染真实内容**，完全绕过骨架/转圈。
   - 后台异步重新拉取数据，若与缓存相同则**静默无任何变化**（像 Gitea 一样肉眼无感）；若不同则**最小化 diff 更新**，不改滚动位置。

2. **S1 层 — 滚动恢复提前到首 paint 之前**
   - 不再依赖 mount 后 rAF 循环。改用 `pageshow` 事件 + `useLayoutEffect`（在浏览器 paint 前执行），在首帧前就把内容区域的 `scrollTop` 设好。
   - 配合 S0，因为有旧内容撑高了 `scrollHeight`，首 paint 前就能设到目标位置，用户第一眼看到的就是正确位置。

3. **S2 层 — 首帧渲染完成前延迟可见性（兜底）**
   - 对没有 sessionStorage 缓存的页面（如首次访问、无痕窗口、sessionStorage 被清），无法走 S0。在容器上加 `visibility: hidden` → 骨架/内容全部就绪且滚动位置设置后再 `visibility: visible`。用户看到的第一帧就是"正确内容 + 正确位置"，避免看到中间过渡。
   - 配合超时（300ms）兜底，极端慢网情况下强行显示，避免白屏。

---

## 三、具体改动计划

### 3.1 新建 sessionStorage 持久化缓存工具

**文件**：`frontend/src/utils/pageContentCache.ts`

- 定义持久化缓存结构：
  ```ts
  type CachedHomeFeed = { posts, postTotal, page, ts };
  type CachedPostDetail = { post, comments, liked, favorited, canEdit, ts };
  type CachedGenericList = { items: unknown[], ts }; // 用于消息/收藏/个人等
  ```
- `saveHomeFeed(boardId, keyword, tag, author, titleOnly, sort, data)` → `sessionStorage.setItem('j13-cache:feed:...', JSON.stringify(...))`
- `loadHomeFeed(...)` → 读取 + 有效性校验（posts 数组非空）
- `savePostDetail(postId, data)` / `loadPostDetail(postId)`
- `saveGeneric(key, data)` / `loadGeneric(key)`（用于其他页面）
- 所有 save 在 `pagehide` 或 `useEffect cleanup` 时触发；加载时若 `ts` 超过 10 分钟，视为过时而不加载（防止用户次日访问出现完全过期内容）。

### 3.2 扩展 scrollRestore.ts，提供提前恢复能力

**文件**：`frontend/src/utils/scrollRestore.ts`

- 新增 `readSavedScrollTop(containerSelector): number | null`：纯读取不等待，不触发 rAF。
- 新增 `pageshow` 监听（在 `initScrollRestore` 中注册）：`pageshow` 时若首帧尚未 paint，立即尝试设置各容器的 `scrollTop`。
- 保留现有的 rAF 重试循环作为兜底（S0 未命中或内容还不够高时）。

### 3.3 HomePage — 用持久化缓存消掉骨架

**文件**：`frontend/src/pages/HomePage.tsx`

- 初始化阶段（原 L139-L177 的 useEffect）：
  - 若 `getFeedCache(...)`（内存 Map）无数据，**先查 `loadHomeFeed(...)`（sessionStorage 持久化）**。
  - 命中 → 直接用旧数据渲染，`loading=false`，`setRestoreScrollTop(cached.scrollTop)`；同时启动网络请求，回来后**仅在数据有差异**时才更新 state（posts / postTotal），避免不必要的重渲染。
  - 未命中 → 保留当前骨架逻辑。
- `pagehide` 时（或在 scrollRestore 的 save 中联动）调用 `saveHomeFeed`。
- **效果**：刷新首帧就是真实帖子列表（上次浏览时看到的），骨架完全不显示；网络回来若内容未变，无任何视觉变化；若内容有新帖子，只是在列表顶部插入新条目（不影响当前浏览位置的可见区域）。

### 3.4 PostDetailPage — 用持久化缓存消掉 Spinner

**文件**：`frontend/src/pages/PostDetailPage.tsx`

- 数据加载 useEffect（L170-L208）：
  - 启动网络请求**之前**先查 `loadPostDetail(postId)`。
  - 命中 → `setPost(cached.post)`, `setComments(cached.comments)`, `setLiked(cached.liked)`, `setFavorited(cached.favorited)`, `setCanEdit(cached.canEdit)`, `setLoading(false)`；网络请求回来后 diff 更新。
  - 未命中 → 保留当前 Spinner 逻辑。
- `pagehide` 时（或 effect cleanup）调用 `savePostDetail`。
- 删除 L446 命中 Spinner 时的 `post-detail-loading` 空白页渲染（持久化命中时不走此路）。

### 3.5 其他有 `loading ? <Spinner>` 早期 return 的页面（可选但建议）

涉及：`FavoritesPage.tsx`、`MessagesPage.tsx`、`ProfilePage.tsx`、`UserProfilePage.tsx`、`AdminBadgesPage.tsx`、`AdminMediaPage.tsx`、`AdminCommentsPage.tsx`、`AdminPostsPage.tsx`、`AdminUsersPage.tsx`、`BoardsManagePage.tsx` 等。

- 使用 `saveGeneric` / `loadGeneric` 包装：在 `loading=true` 但 sessionStorage 有缓存时，先渲染旧数据不显示 Spinner，网络回来后更新。
- 若不纳入首版范围，至少应用 S2（visibility 兜底）消除转圈 → 内容的切换闪烁。

### 3.6 S2 兜底：首帧完成前不可见（index.html + App 层）

**文件**：`frontend/index.html`
- 在 `<body>` 上加 `class="j13-prepaint"`，对应内联 CSS：
  ```css
  .j13-prepaint .main-content,
  .j13-prepaint .admin-main { visibility: hidden; }
  ```

**文件**：`frontend/src/hooks/useScrollRestoration.ts`（新建 hook 功能扩展 或 新建 `useFirstFrameReveal.ts`）
- 在布局组件（MainLayout / AdminLayout）mount 后：
  - 条件 A：数据已渲染（有缓存或网络已回）且滚动已设好 → 立即 `document.body.classList.remove('j13-prepaint')`
  - 条件 B：无缓存且等待网络 → `setTimeout(300ms)` 后强制 reveal，避免白屏
  - 条件 C：rAF 检测到 paint 已发生过（`document.visibilityState` + 首次 paint marker）→ reveal

### 3.7 验证点

- 首页有帖子时刷新：首帧直接看到上次的真实内容 + 正确滚动位置，无骨架闪过；若网络回来帖子相同，肉眼完全无变化（达到 Gitea 级别）。
- 帖子详情页有长文时刷新：同上，无 Spinner，内容+位置直接到位。
- 首次访问 / 无缓存页面：最多有 300ms 以内白屏（或 reveal 后骨架短暂出现），不出现"骨架→内容"切换闪烁。
- SPA 内导航（点链接）行为完全不受影响，`useScrollRestoration` 的 mount-only 特性保证只在刷新/跨布局切换时触发。
- sessionStorage 条目数量上限：按 URL+参数维度，最坏几十条，占用 KB 级内存，无存储压力。

---

## 四、风险与权衡

| 风险 | 影响 | 应对 |
|---|---|---|
| sessionStorage 数据过时（刷新后看到旧帖子/旧内容） | 短暂，但用户担心读到过期数据 | **已考虑**：ts 超过 10min 不加载；且网络请求仍在后台进行，回来后立即更新。与 Gitea 的"先画旧内容，后续若有新帖自然出现"体验一致。 |
| 旧内容的渲染高度与新内容不一致 → 滚动恢复偏差 | 轻微偏差（±几帖高度） | rAF 兜底循环会等新内容高度到位后再精调。S0 的目标是"首帧不闪烁"，精细恢复由 S1 兜底完成。 |
| S2 的 visibility:hidden 导致极端慢网下短暂白屏 | 少数极端网络 | 设置 300ms 超时强制 reveal；与"先骨架再切内容"的闪烁相比，短暂白屏观感更优（与 Gitea 的整页重绘等价）。 |
| S0 存储的数据量（10 篇帖子 + 详情页全文） | KB 级，可忽略 | 不存图片的 base64，只存 API 返回的 JSON。 |
| 后台管理页的数据也做 S0 是否有意义？ | 管理页刷新频率低 | 首版只对 HomePage + PostDetailPage（高频刷新页面）做 S0，其他页做 S2 兜底即可。 |

---

## 五、改动文件清单（确认版）

| 文件 | 操作 | 所属层级 |
|---|---|---|
| `frontend/src/utils/pageContentCache.ts` | 新建 | S0 |
| `frontend/src/utils/scrollRestore.ts` | 修改（加 readSavedScrollTop / pageshow 恢复） | S1 |
| `frontend/src/pages/HomePage.tsx` | 修改（持久化缓存命中逻辑 + 后台静默更新） | S0 |
| `frontend/src/pages/PostDetailPage.tsx` | 修改（持久化缓存命中逻辑 + 后台静默更新） | S0 |
| `frontend/index.html` | 修改（加 j13-prepaint 类 + CSS） | S2 |
| `frontend/src/layouts/MainLayout.tsx` | 修改（调用 reveal 逻辑） | S2 |
| `frontend/src/layouts/AdminLayout.tsx` | 修改（调用 reveal 逻辑） | S2 |
