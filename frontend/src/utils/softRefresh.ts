import { prefetchLayoutShell, prefetchRoute } from './prefetchRoute';

/** 软刷新齐套后的单一提交：各组件同一拍从 cache/快照同步 UI，禁止分批闪烁 */
export const PAGE_SOFT_REFRESH_COMMIT_EVENT = 'page-soft-refresh-commit';

/**
 * 静默刷新当前页：不改画面、无进度条，预热齐套后派发一次 commit。
 */
export async function softRefreshCurrentPage(to?: string): Promise<void> {
  const path = to ?? `${window.location.pathname}${window.location.search}`;
  try {
    await Promise.all([
      prefetchRoute(path, { force: true }),
      prefetchLayoutShell({ force: true }),
    ]);
  } catch {
    // 仍派发 commit，让界面有机会用已有缓存自愈
  }
  window.dispatchEvent(new Event(PAGE_SOFT_REFRESH_COMMIT_EVENT));
}
