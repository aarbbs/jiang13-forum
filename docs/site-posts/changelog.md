# 更新日志

> 建议标题：更新日志  
> 建议 slug：`changelog`  
> 建议路径：`/page/changelog`  
> 建议操作：后台「单页管理」新建并发布；勾选「页脚展示」（可选「侧栏导航」）  
> 复制正文时：从下方第一个 `---` **之后**开始粘贴（Markdown 模式）

---

Docker 镜像、Windows exe、Linux 单文件 **共用同一版本号**。有新版本时，以本页为准。

**当前版本：1.1.5**（2026-09-01）

## 去哪看新版本

| 渠道 | 看什么 | 地址 |
| --- | --- | --- |
| 本页 | 版本号、变更说明、升级注意 | 本站 `/page/changelog` |
| Docker | 镜像标签（`latest` 与 `1.1.x`） | [Docker Hub · Tags](https://hub.docker.com/r/hangzhang714128/jiang13-forum/tags) |
| Windows / Linux | 预编译单文件（与 Docker 同版本） | [Gitea Releases](https://git.iioio.com/freefire/jiang13-forum/releases) |
| 源码 | 提交记录与自行编译 | [Gitea 仓库](https://git.iioio.com/freefire/jiang13-forum) |

**1.1.5 直接下载：**

- Windows x64：[jiang13-1.1.5-windows-amd64.exe](https://git.iioio.com/freefire/jiang13-forum/releases/download/v1.1.5/jiang13-1.1.5-windows-amd64.exe)
- Linux x64：[jiang13-1.1.5-linux-amd64](https://git.iioio.com/freefire/jiang13-forum/releases/download/v1.1.5/jiang13-1.1.5-linux-amd64)
- 校验文件：[SHA256SUMS.txt](https://git.iioio.com/freefire/jiang13-forum/releases/download/v1.1.5/SHA256SUMS.txt)

拉取指定版本镜像：

```bash
docker pull hangzhang714128/jiang13-forum:1.1.5
# 或始终跟随最新
docker pull hangzhang714128/jiang13-forum:latest
```

Windows：停掉正在跑的进程或服务，用新下载的 exe 覆盖原文件（可改名为 `jiang13.exe`），**不要动**旁边的 `data/` 与 `app.ini`，再启动即可。

Linux：赋予执行权限后放到原目录覆盖，同样保留 `data/` 与 `app.ini`。

## 升级注意

- 一般只需换镜像或换 exe，数据目录向后兼容。
- Docker 请继续挂载原来的 `/data` 卷，切勿新建空目录当「升级」。
- 升级后若页面样式异常，强制刷新浏览器（Ctrl+F5）。程序也会在前端资源失效时自动硬刷新。

---

## 1.1.5 — 2026-09-01

首页首屏与交互更稳，Feed 排序语义更清楚。  
本版起同时提供 **Docker 镜像** 与 **Windows / Linux 预编译单文件**（Gitea Release `v1.1.5`）。

**新增 / 调整**

- 首页改为 Go SSR 与 React hydrate（注水）同构，打开首页不再先闪一层空壳再跳内容
- Feed 排序改为：**新评论 / 新帖子 / 推荐帖**；推荐帖只出精华（featured）
- 点击排序会强制刷新列表；软刷新时同步站点限额与品牌文案
- 返回列表用缓存恢复滚动位置，不再重复请求

**修复**

- 发版后软刷新会检测入口壳；chunk（代码分片）404 时自动硬刷新，避免卡在旧页面
- 软刷新齐套前保留旧画面，避免一点击就把内容卸光
- 补齐 `/favicon.ico` 与页面 head 图标；拆除爬虫专用 HTML
- 桌面端隐藏多余的导航汉堡按钮
- 帖行评论数、列表「共 N 条」右对齐；排序栏数字紧跟标签
- 手机端 SSR 顶栏 / 页脚与 React 一致，减少闪动

## 1.1.4 — 2026-08-31

网站监控的地理信息与口径更准确。

- 补全 IP2Location（IP 地理位置库）中国城市中文名，同名城市按省消歧
- 对齐监控概览「双通道」口径文案与诊断抽样说明

## 1.1.3 — 2026-08-31

管理后台可看站点访问情况。

- 新增管理端 **网站监控**：浏览量写入独立 `monitor.db`，与主库分开

## 1.1.2 — 2026-08-31

可选接入官方社区展柜。

- 可选社区上报，以及官方精选展柜（自建站可出现在官方社区列表中）

## 1.1.1 — 2026-08-31

- 评论管理操作收进「更多」菜单，管理员界面更干净

## 1.1.0 — 2026-08-30

一批社区功能与界面整理，版本号从 1.0 跨到 1.1。

**新增**

- 友链申请、独立友链页；页脚左右区域可分别开关
- 自定义单页（后台「单页管理」，如本页）
- 投票帖、悬赏帖、抽奖帖
- 侧栏签到；右侧栏「最新注册」
- 搜索重设计：筛选面板、结果页 chips（筛选标签）
- 帖子管理收进右上角菜单；手机端评论输入默认折叠

**优化**

- 首页帖子列表密度与标题样式
- 开源码桶展示加强，去掉 Feed 顶栏统计
- 单页编辑、列表留白与友链申请体验
- 开发与发行版共用 `dist/data` 数据目录，避免两套数据打架

**修复**

- 手机端搜索入口与底部 Sheet（抽屉面板）
- 占位头像对比度；无头像用户不再误用游客灰底
- 页面双指缩放锁死，正文原图与灯箱仍可 pinch（捏合）放大
- 单页正文排版与帖子详情对齐

## 1.0.0 — 2026-08-23

首次发布 Docker 镜像 `hangzhang714128/jiang13-forum:1.0.0`。

当时已包含论坛核心能力：板块与发帖、楼层评论、点赞收藏、私信、TipTap 富文本、贴纸、修订历史、管理后台、OIDC（开放身份连接）/ SSO（单点登录）、邮件验证码、Gitea 仓库同步、SQLite 单二进制部署，以及 Docker 一键运行。

---

之后发版时：Docker 推 `x.y.z` + `latest`，Gitea 打 tag `vx.y.z` 并挂上对应 exe / linux 文件，再把新版本写到本页最上方。
