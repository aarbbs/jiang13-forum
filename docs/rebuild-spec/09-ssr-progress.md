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
| **上一刀** | Admin `/admin/media`（列表 / 删除 / 同步索引） |
| **下一刀** | **等级/自动徽章 UI** 或 **防刷分成**（`02` §H P2；开刀前确认偏好） |
| **工作区** | 应干净；有未提交改动时先处理再开新刀 |

---

## 一句话状态

论坛核心闭环 + Admin 用户/徽章/媒体 **已迁完**。余量主要是成长体系与防刷、OIDC/存储产品化与体验打磨。

```mermaid
flowchart LR
  core[核心论坛已迁]
  admin[Admin用户徽章媒体]
  growth[等级徽章防刷]
  polish[主题伪静态编辑器]
  deferred[Gitea码桶后置]
  core --> admin --> growth
  admin --> polish
  deferred -.-> admin
```

---

## 已完成里程碑

### 公开站

| 域 | 状态 |
|----|------|
| `/install`、登录/注册/忘记密码、opaque session | 已迁 |
| Feed / 板块 / 搜索 / 三栏 / 右栏 widgets | 已迁 |
| 帖详情：赞藏举报、门控、审核横幅、修订历史 | 已迁 |
| 帖类型：`normal` / `question` / `poll` / `bounty` / `lottery` | 已迁 |
| 评论：发评/回复/赞/私密/编辑删除/@/回复通知 | 已迁（扁平楼层；嵌套树未做） |
| 私信/系统通知、收藏、个人中心、用户页 | 已迁 |
| 友链前台 + Admin（含复检） | 已迁 |
| 站点单页 | 已迁 |
| `/health`、`robots.txt`、`sitemap.xml`、`/uploads` | 已落地（`02` §O 已勾） |

### Admin

| 路径 | 状态 |
|------|------|
| dashboard / boards / moderation / reports / trash | 已迁 |
| settings：品牌、限流、敏感词、SMTP、侧栏、SQLite 备份 | 已迁 |
| friend-links / pages | 已迁 |
| **users / badges / media** | **已迁** |
| settings：OIDC / Gitea / 存储 / 伪静态 Tab | **未迁** |

### 近期提交（摘）

Admin users → badges → **media**

---

## 未完成分层

### P0 — 小清理（可夹带）

- 发评路径挂 `RateLimiter` `comment` 动作（服务层已有键，web 未挂）
- Logo/Favicon/OG 上传、头像裁剪等声明为未做的边角

### P1 — Admin 核心

1. ~~Admin 用户~~ ✓  
2. ~~Admin 徽章~~ ✓  
3. ~~Admin 媒体~~ ✓  

### P2 — 成长与防刷 ← 当前指针候选

- Exp → Lv1–10 设定 UI、自动徽章调度说明、短龄同 IP 互刷拒绝分成（`02` §H）

### P3 — 体验 / 编辑器（可砍或长期）

- 主题、侧栏折叠、虚拟滚动、`feed_list_style`、伪静态 Admin  
- TipTap / Markdown 双模（现行为 textarea + 门控）  
- 游客评论、评论嵌套树（建议：全局 `#floor` + 缩进）  
- 修订 diff、完整 Limits 字数  

### 后置（不阻塞验收）

- K：Gitea `/projects`  
- L：OIDC 产品化 Admin CRUD  
- M：S3 热切换、WebP thumb 全链路产品化  

---

## 默认「继续」刀序

| 序 | 刀 | 产出 |
|----|----|------|
| ✓ | 五种帖类型 + 备份/复检 + §O | 核心闭环 |
| ✓ | Admin users / badges / media | Admin P1 |
| → | 等级设定 **或** 防刷分成 | 需偏好 |
| … | P3 / 后置 | 需明确点名再开 |

---

## 下一刀实现提纲：P2 候选

> 「继续」前请点名：**等级/Exp UI**、**防刷分成**，或其它（OIDC/伪静态等）。

### A. 等级

- Admin 设用户 Exp/Lv（`SetUserLevel` 已有）  
- 公开页等级展示对齐  

### B. 防刷分成

- 短龄同 IP 互刷拒绝创作分成（`02` §H）  

---

## 已完成：Admin 媒体

见 [plans/admin-media.md](plans/admin-media.md)。

## 已完成：Admin 徽章

见 [plans/admin-badges.md](plans/admin-badges.md)。

## 已完成：Admin 用户管理

见 [plans/admin-users.md](plans/admin-users.md)。

---

## 如何查阅

| 问题 | 看哪里 |
|------|--------|
| 某功能做没做？ | [02-features.md](02-features.md) 复选框 |
| 现在该干什么？ | 本文「当前指针」 |
| 路由迁没迁？ | [06-pages-ux.md](06-pages-ux.md) §1 |
| 目录约定？ | [08-gitea-ssr-architecture.md](08-gitea-ssr-architecture.md) |
