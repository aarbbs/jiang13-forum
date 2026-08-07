# 修复：再次进入帖子时滚动位置异常保留

## 问题

浏览帖子滑到下方 → 返回主页 → 再次进入同一帖子，滚动条停在之前阅读的位置，而非顶部。

## 根因

项目未设置 `history.scrollRestoration`（默认 `'auto'`）。浏览器在导航时会对**内部滚动容器**（`overflow: auto` 的 `.page-wrap`）执行滚动位置恢复。虽然 PostDetailPage 重新挂载后 `.page-wrap` 是新 DOM 元素，浏览器仍会在 paint 前将其 `scrollTop` 恢复到上次记录的值。

项目没有 ScrollToTop 机制来覆盖此行为。

## 与刷新恢复的冲突

之前实现的 `useScrollRestoration`（MainLayout mount-only）负责刷新场景的位置恢复。本修复必须与之共存：

| 场景 | 期望行为 | 处理者 |
|---|---|---|
| 刷新帖子页 | 恢复到上次位置 | `useScrollRestoration`（sessionStorage + rAF） |
| SPA 导航进入帖子 | 从顶部开始 | 本修复（重置 scrollTop=0） |
| `/post/123` → `/post/456` | 从顶部开始 | 本修复（重置 scrollTop=0） |

**区分依据**：`pagehide` 时 `saveScrollPositions` 将当前 URL 的滚动记录存入 sessionStorage。刷新后该记录存在；SPA 导航进入时该记录不存在（从未为此 URL 保存过，或已被 `restoreScrollPositions` 消费清除）。因此 PostDetailPage 渲染 `.page-wrap` 时检查 sessionStorage 是否有当前 URL 的记录即可区分两种场景。

**时序保证**：React 的 effect 执行顺序是子组件先于父组件。PostDetailPage 的 `useLayoutEffect` 在 MainLayout 的 `useEffect`（含 `useScrollRestoration`）之前执行。此时 sessionStorage 记录尚未被消费，`hasPendingScrollRestore()` 返回准确值。

## 改动计划

### 1. `frontend/src/utils/scrollRestore.ts` — 新增 `hasPendingScrollRestore`

在现有文件中新增导出函数：

```ts
/** 检查 sessionStorage 中是否有指定 URL 的待恢复滚动记录（不消费/不删除） */
export function hasPendingScrollRestore(url: string = getCurrentUrl()): boolean {
  try {
    const raw = sessionStorage.getItem(storageKey(url));
    if (!raw) return false;
    const entry = JSON.parse(raw) as SavedPositions;
    return !!entry?.containers && Object.keys(entry.containers).length > 0;
  } catch {
    return false;
  }
}
```

纯读取，不删除记录（`restoreScrollPositions` 的 rAF 循环仍需要它来恢复）。

### 2. 新建 `frontend/src/hooks/useScrollToTopOnMount.ts`

通用 hook，在滚动容器渲染就绪后重置到顶部（刷新场景跳过）：

```ts
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { hasPendingScrollRestore } from '../utils/scrollRestore';

/**
 * 滚动容器渲染就绪后重置到顶部。
 * - 首次就绪：刷新场景（sessionStorage 有记录）跳过，让 useScrollRestoration 恢复；
 *   SPA 导航（无记录）重置到顶部。
 * - deps 变化（如 postId 变化）：始终重置到顶部。
 * - 同 deps 的 ready 状态变化（如评论刷新导致 loading 短暂为 true）：不处理，避免误重置。
 */
export function useScrollToTopOnMount(
  scrollRef: RefObject<HTMLElement | null>,
  deps: React.DependencyList,
  ready: boolean,
): void {
  const lastKeyRef = useRef<string | null>(null);
  const key = JSON.stringify(deps);

  useLayoutEffect(() => {
    if (!ready || !scrollRef.current) return;

    if (lastKeyRef.current === null) {
      lastKeyRef.current = key;
      if (!hasPendingScrollRestore()) {
        scrollRef.current.scrollTop = 0;
      }
      return;
    }

    if (lastKeyRef.current !== key) {
      lastKeyRef.current = key;
      scrollRef.current.scrollTop = 0;
    }
  }, [key, ready]); // ready 变化时重新检查
}
```

### 3. `frontend/src/pages/PostDetailPage.tsx` — 调用 hook

在 `pageRef` 定义之后（L108 之后）、`useGlobalWheelScroll` 调用处附近添加：

```ts
import { useScrollToTopOnMount } from '../hooks/useScrollToTopOnMount';
// ...
useScrollToTopOnMount(pageRef, [postId], !loading && !!post);
```

- `deps: [postId]` — `/post/123` → `/post/456` 时重置
- `ready: !loading && !!post` — `.page-wrap` 仅在此时渲染（L446 loading return、L447 !post return），pageRef.current 才有效

### 不需要改动的部分

- **其他页面**（FavoritesPage、MessagesPage、ProfilePage 等）：用户仅报告了帖子页问题。这些页面内容较短，滚动保留不明显。如后续报告可复用此 hook。
- **MainLayout / AdminLayout**：`useScrollRestoration` 不变。
- **`history.scrollRestoration`**：不设为 `'manual'`，避免影响 back/forward 时其他页面的浏览器原生恢复。

## 验证步骤

1. **SPA 导航进入帖子**：从首页点击帖子 → 滑到下方 → 返回首页 → 再次点击同一帖子 → 应从顶部开始。
2. **帖子间切换**：`/post/123` 滑到下方 → 直接导航到 `/post/456` → 应从顶部开始。
3. **刷新保持位置**：在帖子页滑到下方 → F5 刷新 → 应恢复到原位置（`useScrollRestoration` 生效，hook 跳过）。
4. **硬刷新保持位置**：同上但用 Ctrl+F5 → 应恢复到原位置。
5. **首次访问**：从未访问过的帖子 → 应从顶部开始（sessionStorage 无记录）。
6. **诊断无错误**：TypeScript 编译通过。
