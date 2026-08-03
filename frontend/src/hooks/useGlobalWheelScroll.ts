import { useEffect, type RefObject } from 'react';

/** 判断元素是否可在指定方向继续滚动 */
function canElementScroll(el: HTMLElement, deltaY: number): boolean {
  const { overflowY } = getComputedStyle(el);
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
    return false;
  }
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  if (deltaY < 0) return el.scrollTop > 0;
  return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
}

/** 从目标节点向上查找首个可滚动容器 */
function findScrollable(start: HTMLElement | null, deltaY: number, boundary: HTMLElement): HTMLElement | null {
  let el = start;
  while (el && el !== boundary) {
    if (canElementScroll(el, deltaY)) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * 文章页：鼠标在页面任意位置滚轮时，统一滚动主内容区。
 * 保留 textarea、表情面板等主内容区内部可滚动元素的独立滚动。
 */
export function useGlobalWheelScroll(scrollRef: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const root = scrollEl.closest('.app-shell') as HTMLElement | null;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      // Ctrl/⌘ + 滚轮用于浏览器缩放，不拦截
      if (e.ctrlKey || e.metaKey) return;

      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) return;

      const inner = findScrollable(target, e.deltaY, root);
      // 主内容区内部嵌套滚动（如 textarea、表情面板）保留原生行为
      if (inner && inner !== scrollEl && scrollEl.contains(inner)) return;
      // 主内容区外的独立滚动区（如右侧目录）保留原生行为，避免滚轮被抢走
      if (inner && !scrollEl.contains(inner)) return;
      // 鼠标已在主滚动容器上时，交给浏览器原生处理
      if (inner === scrollEl) return;

      const prev = scrollEl.scrollTop;
      scrollEl.scrollTop += e.deltaY;
      if (scrollEl.scrollTop !== prev) {
        e.preventDefault();
      }
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [scrollRef, enabled]);
}
