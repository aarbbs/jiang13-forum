# Issue 预填模板

以下两条可直接复制到本仓库 Issues 创建，或使用仓库自带的 Issue 模板。

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

## Issue #2 · 示例：管理能力扩展（模板文案）

**标题：** `[Feature] 管理后台增加某某能力`

**标签：** `enhancement` `ui/ux` `good first issue`

**正文：**

### 要解决的问题

描述管理员在 React SPA 管理后台 / 前台中缺少的操作入口或能力。

### 现状

| 能力 | 状态 |
| --- | --- |
| 数据模型与业务逻辑 | ✅ / ❌ |
| JSON API（如 `POST /api/admin/...`） | ✅ / ❌ |
| React 管理后台入口 | ✅ / ❌ |
| React 前台操作入口（如适用） | ✅ / ❌ |

### 期望方案

1. 在对应页面为管理员增加操作入口（仅 `role === 'admin'` 可见）
2. 调用已有或新增的 `/api/admin/*` JSON API
3. 成功后刷新列表/详情，无需离开当前页面

### 相关代码

- 后端：`service/`、`handler/api.go`、`router/router.go`
- 前端：`frontend/src/pages/admin/`、`frontend/src/api/client.ts`

### 备注

适合作为 `good first issue` 时，优先选择 API 已就绪、只需补 UI 的小改动。
