import { useEffect } from 'react';
import { restoreScrollPositions } from '../utils/scrollRestore';

/**
 * 在布局组件挂载时恢复当前 URL 的滚动位置（仅刷新场景生效）。
 *
 * 使用 mount-only effect：布局组件在 SPA 内导航时不会重新挂载，
 * 因此此 effect 仅在页面实际重载（刷新）或跨布局切换时触发，
 * 不会干扰 SPA 内导航的默认滚动行为。
 *
 * rAF 重试循环会等待异步内容加载完成后再设置 scrollTop，
 * 组件卸载时通过返回的取消函数终止重试。
 */
export function useScrollRestoration(): void {
  useEffect(() => {
    const cancel = restoreScrollPositions();
    return cancel;
  }, []);
}
