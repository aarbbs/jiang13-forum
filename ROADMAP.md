# 路线图 ROADMAP

> 姜十三论坛仍在积极开发中，功能尚未完善。  
> 欢迎通过 [Issues](https://git.iioio.com/freefire/jiang13-forum/issues) 反馈问题或认领任务。

**图例：** ✅ 已完成 · 🚧 进行中 · 📋 计划中 · 🐛 已知缺陷

---

## 开发状态概览

| 模块 | 状态 | 说明 |
|------|------|------|
| 前台 SPA（React） | ✅ | 浏览、发帖、回复、管理操作已统一在 SPA 内 |
| 管理后台 | ✅ | React 后台 `/admin/*`，与前台风格一致 |
| 评论系统 | ✅ | 换行显示已修复 |
| OIDC Provider | ✅ | 可供 Gitea 等站点 SSO（`ROOT_URL` + `[oauth]`） |

---

## 🐛 已知缺陷（Bug）

_当前无已记录缺陷。发现新问题请提交 [Issue](https://git.iioio.com/freefire/jiang13-forum/issues/new/choose)。_

---

## 📋 计划中（Planned）

| 优先级 | 功能 | 说明 |
|--------|------|------|
| 中 | 通知动态优化 | 右栏最新评论的展示与交互 |
| 低 | 帖子搜索增强 | 标题/正文/作者组合筛选 |
| 低 | 邮件通知 | 回复提醒（需 SMTP 配置） |

---

## 🚧 进行中（In Progress）

_当前无公开认领任务。_

---

## ✅ 已完成（Done）

- [x] React 管理后台（仪表盘、板块、帖子、评论、用户、设置）
- [x] 帖子置顶（帖子详情 + 管理后台）
- [x] 评论回复换行正确显示
- [x] 三栏布局 + 虚拟滚动帖列表
- [x] 浅色 / 暗色主题切换
- [x] 移动端响应式适配
- [x] 用户注册登录、JWT 鉴权
- [x] OIDC Provider（对接 Gitea SSO：Discovery / Authorize / Token / UserInfo）
- [x] OAuth 应用管理（密钥哈希、多客户端、登出端点、groups 映射）
- [x] 板块管理、发帖、TipTap 富文本编辑
- [x] 帖子正文图片本地上传
- [x] 帖子修订历史与 diff 对比
- [x] Feed 排序（最新发帖 / 最新回复 / 热门讨论）
- [x] 可配置编辑时限与论坛参数（限流、字数上限等）
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

_最后更新：2026-06-16_
