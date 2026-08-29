# 路线图 ROADMAP

> 姜十三论坛仍在积极开发中。  
> 演示站：[https://bbs.iioio.com/](https://bbs.iioio.com/) · 欢迎通过本仓库 Issues 反馈问题或认领任务。  
> **本仓库默认开发分支**：`rebuild/gitea-ssr`（Gitea 式 SSR）。`main` = React SPA 对照。

**图例：** ✅ 已完成 · 🚧 进行中 · 📋 计划中 · 🐛 已知缺陷

---

## 开发状态概览

| 模块 | 状态 | 说明 |
|------|------|------|
| 公开页 SSR | ✅ | Go `html/template`；首页 / 板块 / 帖详情 / 用户 / 消息等 |
| 管理后台 SSR | ✅ | `/admin/*` 表单；对照 SPA 见 `main` |
| 评论系统 | ✅ | 楼层 + 嵌套树（`ThreadParentID`） |
| Markdown 编辑 | ✅ | 工具栏 + `/compose/preview`（非 TipTap） |
| 主题 | ✅ | 浅色 / 暗色 / 跟随系统 |
| OIDC Provider | ✅ | Discovery / Authorize / Token / UserInfo；Admin 配置面可继续打磨 |

细节进度见 [`docs/rebuild-spec/09-ssr-progress.md`](docs/rebuild-spec/09-ssr-progress.md)。

---

## 🐛 已知缺陷（Bug）

_当前无已记录缺陷。发现新问题请在本仓库提交 Issue。_

---

## 📋 计划中（Planned）

| 优先级 | 功能 | 说明 |
|--------|------|------|
| 中 | OIDC / 存储 Admin 打磨 | SSO 与 S3 热切换运维面 |
| 低 | 编辑器增强 | 表格、表情贴纸（TipTap 不作为本分支默认） |
| 低 | Gitea `/projects` | 仓库列表页（后置） |

---

## ✅ 已完成（摘，本分支）

- [x] Gitea 式目录与 Go 模板 SSR
- [x] 五种帖类型 + 核心闭环（赞/藏/门控/审核…）
- [x] Admin 仪表盘、板块、审核、用户、徽章、媒体、设置等
- [x] Markdown 发帖/评论编辑器与预览
- [x] 评论嵌套树、浅色/暗色主题
- [x] OIDC Provider 机器入口
- [x] 本分支删除未挂载论坛 JSON API（对照 `main`）

更全清单：[`docs/rebuild-spec/02-features.md`](docs/rebuild-spec/02-features.md)。
