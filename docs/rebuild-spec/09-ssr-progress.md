# 09 · SSR 重构进度与路线图

> **读者**：产品方 / 实现 AI  
> **分支**：`rebuild/gitea-ssr`（`main` = SPA 对照）  
> **验收清单**： [02-features.md](02-features.md)  
> **架构**： [08-gitea-ssr-architecture.md](08-gitea-ssr-architecture.md)  
> **维护约定**：每次「继续」开新刀前更新本文「当前指针」；功能勾选以 `02` 为准，本文管阶段与刀序。

---

## 当前指针

| 项 | 值 |
|----|-----|
| **上一刀** | P0：发评限流 + 品牌 Logo/Favicon/OG 上传与 head meta |
| **下一刀** | **P3 / 后置**（需点名：伪静态、完整 Limits、OIDC、S3 热切换、编辑器、嵌套评论等） |
| **工作区** | 应干净 |

---

## 一句话状态

核心论坛、Admin P1、§H 成长/防刷、P0 品牌图与发评限流 **已齐**。余量主要是体验打磨与后置产品化。

---

## 已完成（摘）

| 域 | 状态 |
|----|------|
| 五种帖 + Admin users/badges/media | 已迁 |
| §H Exp/等级/徽章/防刷 | 已迁 |
| 发评 `RateLimiter` comment | 已挂 |
| 品牌 Logo/Favicon/OG 上传 + favicon/og meta | 已迁 |

---

## 未完成分层

### P0 余量

- 头像裁剪等边角

### P3 — 体验 / 编辑器

- 主题、侧栏折叠、虚拟滚动、`feed_list_style`、伪静态 Admin  
- TipTap / Markdown 双模  
- 游客评论、评论嵌套树  
- 修订 diff、完整 Limits 字数  

### 后置

- K：Gitea `/projects`  
- L：OIDC 产品化 Admin CRUD  
- M：S3 热切换、WebP 全链路产品化  

---

## 默认「继续」

需点名下一刀；未点名时优先小清理或明确产品偏好。

---

## 如何查阅

| 问题 | 看哪里 |
|------|--------|
| 某功能做没做？ | [02-features.md](02-features.md) |
| 现在该干什么？ | 本文「当前指针」 |
| 路由迁没迁？ | [06-pages-ux.md](06-pages-ux.md) §1 |
