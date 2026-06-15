# 路线图 ROADMAP

> 姜十三论坛仍在积极开发中，功能尚未完善。  
> 欢迎通过 [Issues](https://git.iioio.com/freefire/jiang13-forum/issues) 反馈问题或认领任务。

**图例：** ✅ 已完成 · 🚧 进行中 · 📋 计划中 · 🐛 已知缺陷

---

## 开发状态概览

| 模块 | 状态 | 说明 |
|------|------|------|
| 前台 SPA（React） | 🚧 | 核心浏览/发帖/回复可用，部分管理能力仍依赖旧版后台 |
| 管理后台 | 🚧 | 旧版 HTML 后台功能较全；React 侧尚未统一 |
| 评论系统 | 🐛 | 换行显示等问题待修复 |
| 帖子管理 | 🐛 | 置顶 API 已有，React 前台缺操作入口 |

---

## 🐛 已知缺陷（Bug）

| 优先级 | 问题 | 说明 | Issue |
|--------|------|------|-------|
| 高 | 评论回复换行不显示 | 输入多行回复后，展示时合并为一行 | [创建 Issue](https://git.iioio.com/freefire/jiang13-forum/issues/new/choose) |
| 中 | — | （欢迎补充） | — |

### 评论换行不显示 · 详情

- **现象**：在评论框输入带换行的内容，提交后页面上不保留换行
- **相关代码**：`frontend/src/components/CommentContent.tsx`、`frontend/src/utils/content.ts`
- **可能原因**：`\r\n` 未处理、`innerHTML` 与 `white-space: pre-wrap` 叠加异常

---

## 📋 计划中（Planned）

| 优先级 | 功能 | 说明 | Issue |
|--------|------|------|-------|
| 高 | React 前台支持帖子置顶 | 后端 `pinned` 字段与 API 已存在，需在 SPA 管理入口暴露操作 | [创建 Issue](https://git.iioio.com/freefire/jiang13-forum/issues/new/choose) |
| 中 | 管理后台 React 化 | 统一旧版 `/admin/*` 与新版 SPA 体验 | — |
| 中 | 通知已读状态优化 | 右栏通知点击后的已读同步 | — |
| 低 | 帖子搜索增强 | 标题/正文/作者组合筛选 | — |
| 低 | 邮件通知 | 回复提醒（需 SMTP 配置） | — |

### 帖子置顶 · 详情

- **现状**：
  - ✅ 数据模型有 `pinned` 字段
  - ✅ 列表按 `pinned desc` 排序
  - ✅ 旧版管理后台 `/admin/posts` 可置顶
  - ✅ React 列表/详情可显示「置顶」徽章
  - ❌ React SPA 中管理员无法一键置顶/取消
- **相关代码**：`service/post.go`、`handler/admin.go`、`frontend/src/pages/PostDetailPage.tsx`

---

## 🚧 进行中（In Progress）

_当前无公开认领任务。若你正在开发某项，请在对应 Issue 留言认领。_

---

## ✅ 已完成（Done）

- [x] 三栏布局 + 虚拟滚动帖列表
- [x] 浅色 / 暗色主题切换
- [x] 移动端响应式适配
- [x] 用户注册登录、JWT 鉴权
- [x] 板块管理、发帖、Markdown 编辑
- [x] 楼层式评论、引用回复、@ 高亮
- [x] 点赞、收藏、热门帖
- [x] 敏感词过滤、发帖限流
- [x] SQLite 备份、单二进制部署

---

## 如何参与

1. 在 [Issues](https://git.iioio.com/freefire/jiang13-forum/issues) 挑选任务（预填内容见 [docs/issue-templates.md](docs/issue-templates.md)）
2. Fork → 分支 → PR，详见 [CONTRIBUTING.md](CONTRIBUTING.md)
3. 有新想法先开 Issue 讨论，避免重复劳动

---

_最后更新：2026-06-15_
