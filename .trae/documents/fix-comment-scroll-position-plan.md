# 修复主页右侧栏评论点击定位问题

## 问题描述

用户在主页右侧栏点击评论时，如果该评论不是帖子的第一个评论（`floor > 0`），页面跳转后没有定位到该评论上。

## 根因分析

### 问题 1：`jumpToFloor` 使用 `scrollIntoView` 而非 `pageRef.scrollTo`

**文件**: [PostDetailPage.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/pages/PostDetailPage.tsx#L235-L242)

当前 `jumpToFloor` 函数使用 `el.scrollIntoView()` 来滚动：

```typescript
const jumpToFloor = useCallback((floor: number) => {
  const el = document.getElementById(`floor-${floor}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // ...
}, []);
```

但是页面使用了自定义滚动容器 `pageRef`（类名为 `.post-detail-page`），且 `useGlobalWheelScroll` 钩子拦截了滚轮事件，将其转换为对 `pageRef.scrollTop` 的直接操作。这导致原生 `scrollIntoView` 可能无法正确触发滚动。

对比 `jumpToHeadingHash` 函数（第 244-262 行），它正确地使用了 `pageRef.scrollTo()`：

```typescript
const jumpToHeadingHash = useCallback((hash: string, smooth = false) => {
  // ...
  const root = pageRef.current;
  if (root) {
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const top = root.scrollTop + (elRect.top - rootRect.top) - 12;
    root.scrollTo({ top: Math.max(0, top), behavior });
  }
  // ...
}, []);
```

### 问题 2：`#floor-N` 定位缺少重试机制

**文件**: [PostDetailPage.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/pages/PostDetailPage.tsx#L264-L273)

当前 `#floor-N` 定位只有一次 80ms 延迟，没有重试机制：

```typescript
useEffect(() => {
  if (loading || !post) return;
  const m = location.hash.match(/^#floor-(\d+)$/);
  if (!m) return;
  const floor = Number(m[1]);
  if (!floor) return;
  const t = window.setTimeout(() => jumpToFloor(floor), 80);
  return () => clearTimeout(t);
}, [loading, post, comments, location.hash, jumpToFloor]);
```

对比 `#heading-N` 定位（第 275-299 行），它有完善的重试机制（最多 30 次，每次 50ms）。

## 修改方案

### 修改 1：修改 `jumpToFloor` 函数使用 `pageRef.scrollTo`

将 `jumpToFloor` 函数改为使用与 `jumpToHeadingHash` 相同的滚动方式：

```typescript
const jumpToFloor = useCallback((floor: number) => {
  const el = document.getElementById(`floor-${floor}`);
  if (!el) return false;

  const root = pageRef.current;
  if (root) {
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const top = root.scrollTop + (elRect.top - rootRect.top) - 12;
    root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setHighlightFloor(floor);
  clearTimeout(highlightTimer.current);
  highlightTimer.current = setTimeout(() => setHighlightFloor(null), 2000);
  return true;
}, []);
```

### 修改 2：为 `#floor-N` 定位添加重试机制

将 `#floor-N` 定位的 `useEffect` 改为类似 `#heading-N` 的重试机制：

```typescript
useEffect(() => {
  if (loading || !post) return;
  const m = location.hash.match(/^#floor-(\d+)$/);
  if (!m) return;
  const floor = Number(m[1]);
  if (!floor) return;

  let cancelled = false;
  let attempts = 0;
  let timer = 0;

  const tryJump = () => {
    if (cancelled) return;
    if (jumpToFloor(floor)) return;
    attempts += 1;
    if (attempts < 30) {
      timer = window.setTimeout(tryJump, 50);
    }
  };

  timer = window.setTimeout(tryJump, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}, [loading, post, comments, location.hash, jumpToFloor]);
```

## 涉及文件

- `frontend/src/pages/PostDetailPage.tsx`：修改 `jumpToFloor` 函数和 `#floor-N` 定位的 `useEffect`

## 风险评估

- **低风险**：修改仅限于评论定位逻辑，不影响其他功能
- **需测试**：需要验证页面加载时评论定位是否正常工作，以及页面内部导航时是否正常

## 测试步骤

1. 进入主页，点击右侧栏的一个非第一条评论
2. 验证页面跳转到帖子详情后，是否正确定位到目标评论
3. 验证评论高亮效果是否正常显示
4. 测试第一条评论（floor=0）的定位是否仍然正常工作
5. 在帖子详情页直接加载带 hash 的 URL（如 `/post/123#floor-5`），验证定位效果
