# 09 · SSR 重构进度与路线图

> **读者**：产品方 / 实现 AI  
> **分支**：`rebuild/gitea-ssr`（`main` = SPA 对照）  
> **验收清单**： [02-features.md](02-features.md)

---

## 当前指针

| 项 | 值 |
|----|-----|
| **上一刀** | Markdown 编辑器（工具栏 + 预览，共用 md_editor） |
| **下一刀** | 需点名（OIDC / S3 / Gitea / 主题 / 表格表情…） |
| **工作区** | 应干净 |

---

## 一句话状态

核心论坛、Admin、Limits/伪静态、嵌套评论、**Markdown 编辑器**已齐。TipTap / 表格 / 表情贴纸仍后置。

---

## 已完成（摘）

| 域 | 状态 |
|----|------|
| 五种帖 + Admin P1 + §H | 已迁 |
| Limits / 伪静态 / 品牌图 | 已迁 |
| 评论嵌套树 UI | 已迁 |
| Markdown 工具栏 + preview | 已迁 |

---

## 未完成

- P3：主题、TipTip、游客评论、修订 diff  
- 编辑器后置：TipTap、表格、图片组、表情贴纸  
- 后置：OIDC、S3 热切换、Gitea `/projects`  

---

## 如何查阅

| 问题 | 看哪里 |
|------|--------|
| 某功能做没做？ | [02-features.md](02-features.md) |
| 现在该干什么？ | 本文「当前指针」 |
