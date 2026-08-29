# 10 · 公开页设计系统

> **读者**：实现公开页视觉 / CSS 的 AI  
> **前置**：[01-product.md](01-product.md)、[06-pages-ux.md](06-pages-ux.md)  
> **实现**：[`web_src/css/site.css`](../../web_src/css/site.css)、[`templates/base/`](../../templates/base/)  
> **品牌**：默认「姜十三论坛」（安装/后台可改 `site_name`）；强调色取 **青**（纪念向，非 SPA 草绿）

视觉可重设；**信息架构与关键操作流以 06 为准**。本文件只约定公开页壳层与内容表面的视觉语言。

静态资源须带构建版本号：`/ssr-assets/site.css?v={{.AssetVersion}}`（长缓存 + query 穿透，对齐 Gitea）。

---

## 1. 气质

| 项 | 约定 |
|----|------|
| 关键词 | 清青、产品感、冷静、可读、偏内容 |
| 密度 | 接近 V2EX / NGA，同时顶栏对齐 SPA 式工具条 |
| 反模式 | 紫渐变、暖奶油底、大圆角卡片墙、全幅 hero、Inter/Roboto、顶栏链接墙、依赖本机 IBM Plex |

---

## 2. Token

### 2.1 色（CSS 变量 `--j13-*`）

| Token | 浅色 | 暗色 | 用途 |
|-------|------|------|------|
| `--j13-bg` | `#f4f8fa` | `#0c1216` | 页底（微青灰） |
| `--j13-surface` | `#ffffff` | `#152028` | 顶栏、主栏 |
| `--j13-text` | `#14212b` | `#e8eef2` | 正文 |
| `--j13-muted` | `#5a6b75` | `#8b9aab` | 次要 |
| `--j13-accent` | `#0e8a9a` | `#2ec4d6` | 链接 / 主按钮 / 分段 active |
| `--j13-accent-ink` | `#0b5f6b` | `#9ae8f0` | 品牌字、强强调 |
| `--j13-soft` | `#e6f7f9` | `#12343a` | 侧栏 active 底、focus ring |
| `--j13-on-accent` | `#ffffff` | `#0b5f6b` | 主按钮字 |
| `--j13-border` | `#d3e0e6` | `#2a3a44` | 分隔 |
| `--j13-hover` | `#e8f4f6` | `#1c2d36` | 行 hover |

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
| ≥901px | 三栏：左 ~200px / 中 1fr / 右 ~260px；总宽 ~1320px |
| ≤900px | 隐藏右栏；顶栏搜索折行（抽屉化 **下一刀**） |

---

## 4. 组件约定

| 组件 | 规则 |
|------|------|
| 顶栏 | 品牌 \| 搜索条 \|「+ 发帖」主按钮 + 主题 + 私信 + 用户 +「更多」；告别链接墙 |
| 左栏 | 分区「浏览 / 板块」；active = soft 底 + 左边青条 |
| Feed 行 | 头像 · 作者+相对时间 / 标题 / 摘要（最多 2 行）/ 标签 · 右栏回复/赞/阅读；细线分隔非卡片墙 |
| 高级搜索 | `<details>` 默认收起；有筛选条件或错误时展开；顶栏搜索仍 `/?keyword=` |
| 排序 | 分段控件 |
| 标签 / 按钮 / 评论 / 门控 | 同青 token |

---

## 5. 范围边界

- **覆盖**：公开页壳层（含首页门面密度）、资源 `?v=`、浅/暗色
- **不覆盖**：Admin 深重绘、移动抽屉、虚拟滚动、TipTap、改站名

交叉：[06-pages-ux.md](06-pages-ux.md) · [09-ssr-progress.md](09-ssr-progress.md)
