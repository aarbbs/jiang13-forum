import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function listFocusable(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * 浮层无障碍：Escape 关闭、Tab 焦点陷阱、打开时聚焦、关闭后归还焦点。
 */
export function useOverlayA11y(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  options?: {
    /** 打开时优先聚焦的元素 */
    initialFocusRef?: RefObject<HTMLElement | null>;
    /** 关闭后是否归还焦点，默认 true */
    restoreFocus?: boolean;
  },
) {
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const restore = options?.restoreFocus !== false;

  useEffect(() => {
    if (!open) return;

    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const initial =
      options?.initialFocusRef?.current
      ?? container?.querySelector<HTMLElement>(FOCUSABLE)
      ?? null;
    // 推迟到下一帧，确保抽屉 DOM 已挂载
    const focusTimer = requestAnimationFrame(() => initial?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !container) return;
      const nodes = listFocusable(container);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', onKey, true);
      if (restore) {
        prevFocusRef.current?.focus?.();
      }
    };
  }, [open, onClose, containerRef, options?.initialFocusRef, restore]);
}

/** tablist 方向键 / Home / End 切换 */
export function moveTabIndex(
  key: string,
  current: number,
  length: number,
): number | null {
  if (length <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}
