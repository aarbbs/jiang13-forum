# 10 · 公开页设计系统

> **读者**：实现公开页视觉 / CSS 的 AI  
> **前置**：[01-product.md](01-product.md)、[06-pages-ux.md](06-pages-ux.md)  
> **实现**：[`web_src/css/site.css`](../../web_src/css/site.css)、[`templates/base/`](../../templates/base/)  
> **品牌**：默认「姜十三论坛」；首页视觉对齐 `main` SPA 草绿产品壳

视觉可重设；**信息架构与关键操作流以 06 为准**。本文件只约定公开页壳层与内容表面的视觉语言。

静态资源须带构建版本号：`/ssr-assets/site.css?v={{.AssetVersion}}`（长缓存 + query 穿透，对齐 Gitea）。

---

## 1. 气质

| 项 | 约定 |
|----|------|
| 关键词 | 对齐 `main` SPA：草绿 `#18a058`、清新产品壳 |
| 密度 | SPA 同款顶栏工具条 + Feed `post-row--v2` |
| 反模式 | 紫渐变、暖奶油底、大圆角卡片墙、全幅 hero、Inter/Roboto |

---

## 2. Token

### 2.1 色（CSS 变量 `--j13-*`）

| Token | 浅色 | 暗色 | 用途 |
|-------|------|------|------|
| `--j13-bg` / page | `#f5f7fa` | `#141416` | 页底 |
| `--j13-surface` | `#ffffff` | `#1f1f23` | 顶栏、主栏 |
| `--j13-accent` / green | `#18a058` | `#23c36b` | 主色（对齐 main SPA） |
| `--j13-accent-ink` | `#138f4c` | `#6ee7a0` | 强强调 |
| `--j13-soft` / green-bg | `#edfbf3` / `rgba(24,160,88,.08)` | 绿 soft | active / hover |
| `--j13-border` | `#e8edf2` | `#2e2e32` | 分隔 |

语义色（ok / warn / err / pin / feat）随主题成对定义；feat 用青 soft，不用草绿。

### 2.2 字号与字重

| 阶 | 尺寸 | 用途 |
|----|------|------|
| `xs` | 0.72–0.75rem | 口号、辅助 |
| `sm` | 0.8125rem | 元信息、侧栏、顶栏次级 |
| `md` | 0.9375rem | 正文默认 |
| `lg` | 1.15rem | Feed 标题 |
| `xl` | 1.35rem | 帖标题 |
| `brand` | 1.3rem / 700 | 顶栏站点名 |

字体栈：**中文优先** PingFang SC / Hiragino / Microsoft YaHei / Noto Sans SC（与 SPA 一致，确保本机可见）；代码 Cascadia / Consolas。不引入 Inter/Roboto，不依赖本机 IBM Plex。

### 2.3 间距与圆角

- 栅格：4px 基准；总宽 `--j13-frame: 1320px`
- 圆角：`--j13-radius: 8px`；搜索 pill / 排序分段可用满圆角
- 阴影：sticky 顶栏微阴影

### 2.4 动效

| 处 | 行为 |
|----|------|
| 主题 | `color` / `background` / `border-color` `150ms ease` |
| Feed 行 | hover 背景 |
| 顶栏 | sticky 阴影；搜索 focus soft ring |

---

## 3. 布局

| 断点 | 行为 |
|------|------|
| ≥901px | 三栏：左 210px / 中 1fr / 右 280px；总宽 ~1400px（对齐 SPA） |
| ≤900px | 隐藏右栏；顶栏搜索折行（抽屉化 **下一刀**） |

---

## 4. 组件约定

| 组件 | 规则 |
|------|------|
| 顶栏 | SPA：品牌 \| 搜索胶囊（筛选钮 + Ctrl+K）\| 发帖绿钮 \| 主题/私信/头像菜单 |
| 左栏 | 浏览 / 板块；active 绿底；板块色槽 + 帖数 |
| Feed 行 | `post-row--v2`：头像 · 徽章+标题 · 摘要（依 feed_list_style）· 元信息 · 回复数 |
| 高级搜索 | 顶栏筛选打开；有条件时 details 展开 |
| 排序 | SPA `feed-sort-tab` 绿 active |

---

## 5. 范围边界

- **覆盖**：公开页壳层（含首页门面密度）、资源 `?v=`、浅/暗色
- **不覆盖**：Admin 深重绘、移动抽屉、虚拟滚动、TipTap、改站名

交叉：[06-pages-ux.md](06-pages-ux.md) · [09-ssr-progress.md](09-ssr-progress.md)
