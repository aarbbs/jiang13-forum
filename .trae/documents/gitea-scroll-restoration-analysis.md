# Gitea 全局滚动位置保持机制分析

> 任务：分析 Gitea 如何做到全局任意界面、任意位置，浏览器强制刷新（包括硬刷新 Ctrl+F5）仍不会让页面回到顶部。

## 摘要（核心结论，已根据用户实测修正）

经过对 Gitea 仓库的深度二轮检索，**Gitea 并没有实现任何自定义的滚动位置恢复机制**——不使用 sessionStorage/localStorage 保存滚动位置、没有 pagehide/beforeunload 监听、没有 Service Worker、没有 scrollRestoration 操作。它的核心策略是 **"不覆盖浏览器默认行为"**。

**关键修正**：之前推断"硬刷新（Ctrl+F5）会跳回顶部"是错误的。实测确认 Gitea 在硬刷新后**同样保持滚动位置**。真实原因是：**Chrome / Edge 等 Chromium 内核浏览器的原生"重载滚动恢复"功能**——浏览器在重载前将滚动位置保存在**内存**中，新页面加载完成后恢复。这个内存状态独立于 HTTP 缓存，因此**硬刷新（只绕过 HTTP 缓存）不会清除它**。

核心要点：
- 软刷新（F5/Ctrl+R）和硬刷新（Ctrl+F5/Ctrl+Shift+R）**都保持滚动位置**（在 Chrome/Edge 上）
- 这是**浏览器原生行为**，不是 Gitea 的代码实现的
- Gitea 做对的是"没有破坏它"：未设置 `history.scrollRestoration = 'manual'`，没有干扰重载流程
- **浏览器差异**：Chrome/Edge 保持；Firefox 在硬刷新后可能回到顶部

---

## 1. 确切机制

| 维度 | 实际情况 |
|---|---|
| sessionStorage/localStorage 保存滚动位置？ | **没有** |
| `history.scrollRestoration`？ | **未设置**（保持浏览器默认 `'auto'`） |
| 自定义 JS 模块？ | **不存在** |
| 后端驱动？ | **没有** |
| 实际机制 | 浏览器原生 `history.scrollRestoration = 'auto'` 默认行为 |

**关键事实**：htmx 2.x（Gitea 使用的版本）**不会**设置 `history.scrollRestoration = 'manual'`。在 htmx 2.0.8 完整源码中搜索 `scrollRestoration`，结果为 **0 处匹配**。这一点至关重要——如果 htmx 设了 `manual`，浏览器就不会在刷新时自动恢复，但 htmx 2.x 没有这样做。

---

## 2. 涉及的源码文件

### 2.1 Gitea 侧关键文件

**`web_src/js/htmx.ts`**（htmx 配置入口，最关键）
```typescript
// https://github.com/go-gitea/gitea/blob/main/web_src/js/htmx.ts
import htmx from 'htmx.org';
import 'idiomorph/htmx';
import type {HtmxResponseInfo} from 'htmx.org';
import {showErrorToast} from './modules/toast.ts';

type HtmxEvent = Event & {detail: HtmxResponseInfo};

export function initHtmx() {
  window.htmx = htmx;
  htmx.config.requestClass = 'is-loading';
  htmx.config.scrollIntoViewOnBoost = false;  // 仅禁用 boost 元素的自动滚动入视图，不影响刷新恢复

  document.body.addEventListener('htmx:sendError', (event: Partial<HtmxEvent>) => {
    showErrorToast(`Network error when calling ${event.detail!.requestConfig.path}`);
  });
  document.body.addEventListener('htmx:responseError', (event: Partial<HtmxEvent>) => {
    showErrorToast(`Error ${event.detail!.xhr.status} when calling ${event.detail!.requestConfig.path}`);
  });
}
```

要点：
- `scrollIntoViewOnBoost = false` 仅控制 htmx boost 导航时是否将目标元素滚动入视图，**与页面刷新后的滚动恢复无关**
- **没有任何 `history.scrollRestoration` 赋值**

**`templates/base/head.tmpl`**（基础 HTML 模板的 body 标签）
```html
<body hx-headers='{"x-csrf-token": "{{.CsrfToken}}"}'
      hx-swap="outerHTML" hx-ext="morph" hx-push-url="false">
```
- `hx-push-url="false"` 意味着 htmx 导航默认**不**向浏览器历史压入新 URL，不干扰浏览器原生的历史/滚动追踪

**其他已检查文件（均无滚动恢复代码）**：

| 文件 | 内容 |
|---|---|
| `web_src/js/bootstrap.ts` | 全局错误处理器，设置 `__webpack_public_path__` |
| `web_src/js/globals.ts` | 仅加载 jQuery |
| `web_src/js/index.ts` | 入口文件，`onDomReady` 内动态 import `index-domready.ts` |
| `web_src/js/index-domready.ts` | 调用 `initHtmx` 及所有 `init*` 初始化函数 |
| `web_src/js/features/common-page.ts` | 导航栏切换、页脚语言/主题选择器、下拉菜单 |
| `web_src/js/utils/dom.ts` | 滚动相关代码仅用于 textarea 自动调整高度，与页面滚动恢复无关 |
| `templates/base/head_script.tmpl` | 仅设置 `window._globalHandlerErrors` 和 `window.config`，无滚动恢复代码 |

在 `web_src/js/features/` 完整目录列表中**没有**任何名为 `async-loader`、`global-fetch`、`common-fetch`、`scroll-restoration`、`stick-to-bottom` 的文件。

### 2.2 htmx 2.x 源码侧（对比）

```javascript
// htmx 2.0.8 src/htmx.js 的 config 默认值
config: {
  historyEnabled: true,
  historyCacheSize: 10,           // sessionStorage 中缓存 10 页 HTML 快照
  refreshOnHistoryMiss: false,
  scrollIntoViewOnBoost: true,    // Gitea 覆盖为 false
  // 注意：没有 scrollRestoration 字段
}
```
- htmx 源码 URL: https://github.com/bigskysoftware/htmx/blob/master/src/htmx.js
- 在完整源码中搜索 `scrollRestoration`、`beforeunload`、`pagehide`、`popstate`，结果均为 0 匹配

---

## 3. 与 htmx "异步/渐进加载"模式的集成

Gitea 的异步加载模式基于 **htmx 2.0.8 + idiomorph 0.7.4**：
- **`package.json` 依赖**：`"htmx.org": "2.0.8"`, `"idiomorph": "0.7.4"`
- **body 配置**：`hx-swap="outerHTML"` + `hx-ext="morph"` + `hx-push-url="false"`
- 很多页面导航通过 htmx 发起 AJAX 请求获取 HTML 片段，用 idiomorph 做 DOM morph 替换

**与滚动恢复的关系**：
1. 由于 `hx-push-url="false"`，大多数 htmx 导航**不创建新的历史条目**，浏览器 URL 不变，浏览器原生的滚动位置追踪不被干扰
2. htmx 2.x **不设置** `history.scrollRestoration = 'manual'`（搜索 htmx 源码 0 处匹配），所以浏览器默认的 `'auto'` 恢复始终生效
3. `htmx.config.scrollIntoViewOnBoost = false` 禁用了 htmx 在 boost 导航后将目标元素滚动入视图的行为，避免 htmx 导航时意外改变滚动位置
4. htmx 的 history cache（`historyCacheSize: 10`，存储在 sessionStorage）仅用于 back/forward 时的 HTML 快照恢复，**不涉及刷新时的滚动位置恢复**

**简言之**：Gitea 的 htmx 集成**刻意不干扰**浏览器原生的滚动恢复，通过"不设置 manual、不 push URL"让浏览器自己处理。

---

## 4. 硬刷新 vs 软刷新 —— 修正后的澄清

### 之前推断的错误
之前认为"硬刷新（Ctrl+F5）会绕过缓存，浏览器不会恢复滚动位置"——这个推断是**错误的**。

### 真实机制：浏览器内存中的滚动状态

硬刷新（Ctrl+F5 / Ctrl+Shift+R）的作用范围被广泛误解：

| 操作 | 清除 HTTP 缓存 | 清除 sessionStorage | 清除内存滚动状态 |
|---|---|---|---|
| F5 软刷新 | 否 | 否 | 否 |
| Ctrl+F5 硬刷新 | **是** | **否** | **否** |
| 关闭标签页 | — | 是 | 是 |

**关键点**：浏览器在重载前将当前滚动位置保存在**内存**中（绑定到当前 history 条目），新页面加载完成后自动恢复。这个内存状态：
- 独立于 HTTP 缓存 → 硬刷新不清除它
- 独立于 sessionStorage/localStorage → 不需要 JS 主动保存
- 是 Chrome/Edge 的原生功能，与 `history.scrollRestoration` 相关但作用于重载场景

### 软刷新（F5 / Ctrl+R）—— 有效
- 浏览器原生恢复滚动位置
- 所有现代浏览器均支持

### 硬刷新（Ctrl+F5 / Ctrl+Shift+R）—— **也有效（Chrome/Edge）**
- 硬刷新只绕过 HTTP 缓存（强制重新下载资源）
- **不影响**浏览器的内存滚动状态
- Chrome/Edge 在硬刷新后**仍会恢复滚动位置**
- 这是用户在 Gitea 上观察到的现象的真实原因

### 浏览器差异（重要）

| 浏览器 | F5 软刷新 | Ctrl+F5 硬刷新 |
|---|---|---|
| Chrome / Edge (Chromium) | ✅ 保持滚动 | ✅ 保持滚动 |
| Firefox | ✅ 保持滚动 | ❌ 可能回到顶部 |
| Safari | 视版本而定 | 视版本而定 |

**结论**：Gitea 在硬刷新后保持滚动位置，**不是因为 Gitea 实现了什么机制，而是因为 Chrome/Edge 浏览器原生就这么做**。如果在 Firefox 上硬刷新 Gitea，可能会观察到滚动位置丢失。

---

## 5. 为什么"全局任意界面任意位置"都生效？

由于 Gitea 依赖的是浏览器原生重载滚动恢复（Chrome/Edge 的内存级机制），这个行为是**浏览器层面的全局机制**，与具体页面无关：
- 浏览器在页面卸载前自动将当前滚动位置保存在内存中（绑定到当前 history 条目）
- 重新加载时（无论软/硬刷新），浏览器在新页面 load 完成后自动恢复到记录的滚动位置
- 这个机制对任何 URL、任何滚动位置都生效，不需要每个页面单独配置
- Gitea 是 MPA（多页应用，服务端渲染 HTML），每次刷新都返回完整 HTML，浏览器能准确恢复

Gitea 做对的不是"实现了滚动恢复"，而是"**没有破坏浏览器已有的滚动恢复**"。许多 SPA 框架（包括某些 React Router 配置）会显式设置 `history.scrollRestoration = 'manual'` 并自行管理滚动，一旦自行管理失败（比如异步加载竞态），反而会导致刷新后跳回顶部。

---

## 6. 局限性总结（已修正）

1. ~~硬刷新不支持~~ → **修正**：Chrome/Edge 上硬刷新也保持滚动位置；Firefox 上可能丢失
2. **完全依赖浏览器行为**：不同浏览器/版本的刷新滚动恢复行为有差异（Chrome/Edge vs Firefox）
3. **无降级方案**：如果浏览器原生的滚动恢复因任何原因失效（例如浏览器扩展干扰），Gitea 没有备用的 sessionStorage 方案
4. **MPA 架构的天然优势**：Gitea 是服务端渲染的 MPA，每次刷新返回完整 HTML，浏览器能准确恢复滚动位置。SPA 架构由于初始 HTML 为空、内容由 JS 异步渲染，浏览器在 `load` 事件时尝试恢复往往落空——这是 SPA 的天然劣势
5. **异步内容加载的竞态**：如果页面有异步加载的内容，浏览器恢复滚动位置时目标位置内容可能尚未加载完成，可能导致恢复位置偏差

---

## 7. 与当前项目（jiang13-forum）的对比

当前项目是 **React + TypeScript + Vite 的 SPA**，使用 react-router-dom。现状：
- 全局**无** scroll restoration 逻辑
- 仅 [VirtualPostList.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/VirtualPostList.tsx#L135-L156) 通过 `restoreScrollTop` 属性做了局部滚动恢复
- React Router v6 默认**不**自动恢复滚动位置（需要 `ScrollRestoration` 组件或第三方方案）

若要在 jiang13-forum 实现 Gitea 同等效果，可参考的方向（仅作信息参考，不在本次任务范围内实施）：
- 在路由层使用 React Router 的 `<ScrollRestolation />` 组件
- 或在应用入口确认未设置 `history.scrollRestoration = 'manual'`
- 注意：React SPA 的刷新滚动恢复比 MPA 复杂，因为初始 HTML 通常为空，内容由 JS 异步渲染，浏览器在 `load` 事件时尝试恢复可能落空，需要额外的 `useEffect` + sessionStorage 兜底

---

## 8. 一句话总结

**Gitea 没有实现任何自定义的滚动位置恢复机制。它在软刷新和硬刷新后都能保持滚动位置（在 Chrome/Edge 上），是因为浏览器原生会在重载前将滚动位置保存在内存中并在重载后恢复——这个内存状态独立于 HTTP 缓存，所以硬刷新也不会清除它。Gitea 只是"没有破坏"这个浏览器原生行为。但这是 Chromium 内核浏览器的特性，Firefox 在硬刷新后可能丢失滚动位置。**

---

## 参考来源

- Gitea htmx 配置：https://github.com/go-gitea/gitea/blob/main/web_src/js/htmx.ts
- Gitea body 模板：https://github.com/go-gitea/gitea/blob/main/templates/base/head.tmpl
- htmx 2.x 源码：https://github.com/bigskysoftware/htmx/blob/master/src/htmx.js
- MDN history.scrollRestoration：https://developer.mozilla.org/en-US/docs/Web/API/History/scrollRestoration
