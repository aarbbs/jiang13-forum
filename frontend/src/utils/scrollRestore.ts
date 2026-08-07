/**
 * 全局滚动位置恢复：基于 sessionStorage + pagehide。
 *
 * 背景：本应用为固定视口（100dvh + overflow:hidden）SPA，window 不滚动，
 * 浏览器原生 scrollRestoration 对内部滚动容器无效。
 * 因此在 pagehide 时主动将各滚动容器的 scrollTop 存入 sessionStorage，
 * 页面重载后通过 rAF 重试机制在异步内容加载完成后恢复。
 *
 * 适用场景：浏览器刷新（F5 / Ctrl+R / Ctrl+F5）后保持原阅读位置。
 * 不干扰 SPA 内导航的默认滚动行为（布局组件不重新挂载，mount-only effect 不触发）。
 */

const STORAGE_PREFIX = 'j13-scroll:';

/** 候选滚动容器选择器（覆盖主站与后台各页面） */
const SCROLL_SELECTORS = [
  '.main-content--feed-mobile-scroll', // 移动端首页 Feed 整栏滚动
  '.post-list-scroll', // 桌面端首页 Feed 列表滚动
  '.page-wrap', // 帖子详情 / 个人主页 / 消息等
  '.admin-main', // 后台主内容区
] as const;

type SavedPositions = {
  containers: Record<string, number>;
  ts: number;
};

function storageKey(url: string): string {
  return STORAGE_PREFIX + url;
}

function getCurrentUrl(): string {
  return window.location.pathname + window.location.search;
}

/** 保存当前页面各滚动容器的位置到 sessionStorage */
export function saveScrollPositions(url: string = getCurrentUrl()): void {
  try {
    const containers: Record<string, number> = {};
    for (const selector of SCROLL_SELECTORS) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.scrollTop > 0) {
        containers[selector] = Math.round(el.scrollTop);
      }
    }
    if (Object.keys(containers).length === 0) return;
    const entry: SavedPositions = { containers, ts: Date.now() };
    sessionStorage.setItem(storageKey(url), JSON.stringify(entry));
  } catch {
    // sessionStorage 不可用或已满，静默失败
  }
}

type CancelFn = () => void;

/**
 * 从 sessionStorage 读取并恢复指定 URL 的滚动位置。
 * 使用 rAF 重试，等待异步内容加载完成后再设置 scrollTop。
 * 返回取消函数，用于在组件卸载时终止重试循环。
 */
export function restoreScrollPositions(url: string = getCurrentUrl()): CancelFn {
  let entry: SavedPositions | null = null;
  try {
    const raw = sessionStorage.getItem(storageKey(url));
    if (raw) entry = JSON.parse(raw) as SavedPositions;
  } catch {
    return () => {};
  }
  if (!entry?.containers || Object.keys(entry.containers).length === 0) {
    return () => {};
  }

  let cancelled = false;
  let rafId = 0;
  const deadline = performance.now() + 4000;
  const pending = Object.entries(entry.containers);
  const done = new Set<string>();

  const tryRestore = (selector: string, target: number): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    // 内容尚未加载到足以滚动到目标位置，等待重试
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll < target - 1) return false;
    el.scrollTop = target;
    return Math.abs(el.scrollTop - target) <= 1;
  };

  const tick = () => {
    if (cancelled) return;
    for (const [selector, target] of pending) {
      if (done.has(selector)) continue;
      if (tryRestore(selector, target)) {
        done.add(selector);
      }
    }
    if (done.size === pending.length || performance.now() > deadline) {
      // 全部恢复完成或超时，清除存储条目（避免跨布局切换返回时错误恢复）
      try {
        sessionStorage.removeItem(storageKey(url));
      } catch {
        // ignore
      }
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}

let initialized = false;

/** 注册全局 pagehide 监听器（在应用入口调用一次） */
export function initScrollRestore(): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;
  window.addEventListener('pagehide', () => {
    saveScrollPositions();
  });
}
