# Issue 预填模板

以下两条可直接复制到 [Gitea Issues](https://git.iioio.com/freefire/jiang13-forum/issues/new) 创建，或使用仓库自带的 Issue 模板。

---

## Issue #1 · 评论回复换行不显示

**标题：** `[Bug] 评论回复换行不显示`

**标签：** `bug` `ui/ux`

**正文：**

### 问题描述

在帖子详情页的评论框中输入多行文字（按 Enter 换行），提交后评论展示区域不保留换行，所有文字合并为一行。

### 复现步骤

1. 打开任意帖子详情页（如 `/post/2`）
2. 在底部评论框输入：
   ```
   第一行
   第二行
   第三行
   ```
3. 点击发送
4. 查看刚发布的评论

### 期望行为

评论正文按输入时的换行分段显示，行与行之间有明显间隔。

### 实际行为

多行内容被渲染成单行连续文字。

### 相关代码

- `frontend/src/components/CommentContent.tsx`
- `frontend/src/utils/content.ts`（`highlightMentions` 中的 `\n` → `<br>` 转换）
- `frontend/src/styles/global.css`（`.floor-body` 的 `white-space: pre-wrap`）

### 可能原因

- 仅处理了 `\n`，未处理 Windows 的 `\r\n`
- `dangerouslySetInnerHTML` 与 `pre-wrap` 样式叠加导致表现异常
- 服务端 `strings.TrimSpace` 或其他处理误删换行（待排查）

### 环境

- 前台：React SPA（`:3000` 嵌入版或 `:5173` 开发版）
- 浏览器：Chrome / Edge 最新版

---

## Issue #2 · React 前台支持帖子置顶

**标题：** `[Feature] React 前台增加帖子置顶操作`

**标签：** `enhancement` `ui/ux` `good first issue`

**正文：**

### 要解决的问题

管理员无法在 React SPA 前台对帖子执行置顶/取消置顶，必须跳转到旧版 HTML 管理后台（`/admin/posts`），体验割裂。

### 现状

| 能力 | 状态 |
|------|------|
| 数据模型 `pinned` 字段 | ✅ 已有 |
| 列表按置顶排序 | ✅ 已有 |
| API `POST /admin/api/posts/:id/pin` | ✅ 已有 |
| 旧版后台置顶按钮 | ✅ 已有 |
| React 列表/详情显示置顶徽章 | ✅ 已有 |
| **React 前台置顶操作入口** | ❌ 缺失 |

### 期望方案

在 React SPA 中为管理员提供置顶操作，例如：

1. **帖子详情页**：标题旁增加「置顶 / 取消置顶」按钮（仅 `role === 'admin'` 可见）
2. **帖列表项**：管理员 hover 时显示置顶快捷操作（可选）
3. 调用已有 API，成功后刷新列表/详情，无需跳转旧后台

### 相关代码

- 后端：`service/post.go` → `SetPinned`，`handler/admin.go` → `AdminAPIPinPost`
- 前端：`frontend/src/pages/PostDetailPage.tsx`、`frontend/src/components/PostListItem.tsx`
- 参考旧版：`embed_static/templates/admin/posts.html` 中的 `togglePin`

### 备注

适合作为 `good first issue`，改动范围小、API 已就绪。
