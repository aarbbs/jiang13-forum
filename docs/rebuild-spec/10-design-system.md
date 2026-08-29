# 10 · 公开页设计系统

> **读者**：实现公开页视觉 / CSS 的 AI  
> **前置**：[01-product.md](01-product.md)、[06-pages-ux.md](06-pages-ux.md)  
> **实现**：[`web_src/css/site.css`](../../web_src/css/site.css)、[`templates/base/`](../../templates/base/)  
> **品牌**：默认「姜十三论坛」（安装/后台可改 `site_name`）

视觉可重设；**信息架构与关键操作流以 06 为准**。本文件只约定公开页壳层与内容表面的视觉语言。

---

## 1. 气质

| 项 | 约定 |
|----|------|
| 关键词 | 墨青、编辑式、冷静、可读、偏内容 |
| 密度 | 接近 V2EX / NGA：一屏多信息，非营销留白 |
| 反模式 | 紫渐变、暖奶油底、大圆角卡片墙、全幅 hero、Inter/Roboto 默认堆 |

---

## 2. Token

### 2.1 色（CSS 变量 `--j13-*`）

| Token | 浅色 | 暗色 | 用途 |
|-------|------|------|------|
| `--j13-bg` | `#f3f4f6` | `#0f1419` | 页底（冷纸 / 墨底） |
| `--j13-surface` | `#ffffff` | `#1a222c` | 顶栏、主栏底 |
| `--j13-text` | `#14212b` | `#e8eef2` | 正文 |
| `--j13-muted` | `#5b6b76` | `#8b9aab` | 次要 |
| `--j13-accent` | `#0d9488` | `#2dd4bf` | 链接 / 强调 |
| `--j13-accent-ink` | `#134e4a` | `#99f6e4` | 品牌字、强强调 |
| `--j13-on-accent` | `#ffffff` | `#134e4a` | 主按钮字 |
| `--j13-border` | `#d5dde3` | `#2c3844` | 分隔线 |
| `--j13-hover` | `#e8eef0` | `#243040` | 行 hover |

语义色（ok / warn / err / pin / feat）继续用既有 `--j13-ok-*` 等，随主题成对定义。

### 2.2 字号与字重

| 阶 | 尺寸 | 用途 |
|----|------|------|
| `xs` | 0.75rem | 口号、辅助 |
| `sm` | 0.8125rem | 元信息、侧栏 |
| `md` | 0.9375rem | 正文默认 |
| `lg` | 1.125rem | Feed 标题 |
| `xl` | 1.35rem | 帖标题 |
| `brand` | 1.25rem / 700 | 顶栏站点名 |

字体栈：西文优先 `IBM Plex Sans`（本机有则用），中文 `PingFang SC` / `Hiragino Sans GB` / `Noto Sans SC` / `Microsoft YaHei`；代码 `IBM Plex Mono` / `Cascadia Code` / `Consolas`。不引入 Inter/Roboto。

### 2.3 间距与圆角

- 栅格：4px 基准；常用 `0.5 / 0.75 / 1 / 1.25 / 1.5 rem`
- 圆角：`--j13-radius: 6px`（控件）；列表行无大圆角卡片
- 阴影：仅 sticky 顶栏微阴影 `0 1px 0 var(--j13-border)` + `0 4px 12px rgba(0,0,0,.04)`（滚动时）

### 2.4 动效

| 处 | 行为 |
|----|------|
| 主题 | `color` / `background` / `border-color` `150ms ease` |
| Feed 行 | hover 背景 `120ms ease` |
| 顶栏 | sticky 时阴影淡入 |

---

## 3. 布局

| 断点 | 行为 |
|------|------|
| ≥901px | 三栏：左 ~200px / 中 1fr / 右 ~240px；总宽 ~1120px |
| ≤900px | 隐藏右栏（抽屉化 **下一刀**） |

主栏与侧栏之间用细线或间距，**不**用大卡片包住整栏。

---

## 4. 组件约定

| 组件 | 规则 |
|------|------|
| 顶栏 | 品牌一级信号；nav 次级；主题钮弱边框 |
| 侧栏链 | 字号 sm；active 用左边框或 accent 字重，无厚底块 |
| Feed 行 | 细线分隔；标题 lg；无白盒卡片 |
| 标签 | 小圆角色块；语义色见 token |
| 按钮 | 主：accent 底；次：边框；文字：linkbtn |
| 评论 | 楼层号强调；嵌套左边线；密度高于卡片堆 |
| 门控壳 | 虚线/淡底提示锁定，不抢正文 |

---

## 5. 范围边界

- **本系统覆盖**：公开页壳层（顶栏、三栏、Feed、帖详情、暗色）
- **不覆盖**：Admin 深度重绘、移动抽屉、虚拟滚动、TipTap

交叉：[06-pages-ux.md](06-pages-ux.md) 路由与操作流 · [09-ssr-progress.md](09-ssr-progress.md) 进度
