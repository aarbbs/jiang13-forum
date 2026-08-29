# 09 · SSR 重构进度与路线图

> **读者**：产品方 / 实现 AI  
> **分支**：`rebuild/gitea-ssr`（`main` = SPA 对照）  
> **验收清单**： [02-features.md](02-features.md)  
> **架构**： [08-gitea-ssr-architecture.md](08-gitea-ssr-architecture.md)

---

## 当前指针

| 项 | 值 |
|----|-----|
| **上一刀** | 完整 Limits + 伪静态 Admin / 规范 URL |
| **下一刀** | **后置或体验**（需点名：OIDC、S3 热切换、编辑器、嵌套评论、Gitea…） |
| **工作区** | 应干净 |

---

## 一句话状态

核心论坛、Admin、§H、品牌图、发评限流、**完整 Limits 与伪静态**已齐。余量多为后置产品化与体验打磨。

---

## 已完成（摘）

| 域 | 状态 |
|----|------|
| Admin users / badges / media | 已迁 |
| §H 等级 / 徽章 / 防刷 | 已迁 |
| 品牌 Logo/Favicon/OG + 发评限流 | 已迁 |
| 内容 Limits + 伪静态 | 已迁 |

---

## 未完成

### P3 体验

- 主题、侧栏折叠、虚拟滚动、TipTap、游客评论、嵌套树、修订 diff  

### 后置

- OIDC Admin CRUD、S3 热切换 UI、Gitea `/projects`、WebP 产品化  

---

## 如何查阅

| 问题 | 看哪里 |
|------|--------|
| 某功能做没做？ | [02-features.md](02-features.md) |
| 现在该干什么？ | 本文「当前指针」 |
