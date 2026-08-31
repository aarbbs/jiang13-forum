import { isChunkLoadError, reloadForStaleChunk, reloadIfShellStale } from './chunkLoad';
import { prefetchLayoutShell, prefetchRoute } from './prefetchRoute';
import { doneTransition, startTransition } from './spaTransition';

/** 软刷新齐套后的单一提交：各组件同一拍从 cache/快照同步 UI，禁止分批闪烁 */
export const PAGE_SOFT_REFRESH_COMMIT_EVENT = 'page-soft-refresh-commit';

export type SoftRefreshOpts = {
  /** 是否显示顶栏进度条（Logo 刷新开；下拉关） */
  progress?: boolean;
};

/**
 * 软刷新当前页：先检测入口壳是否过期，再预热齐套后派发一次 commit。
 * `progress: true` 时走顶栏进度条。
 */
export async function softRefreshCurrentPage(to?: string, opts?: SoftRefreshOpts): Promise<void> {
  const path = to ?? `${window.location.pathname}${window.location.search}`;
  const id = opts?.progress ? startTransition() : undefined;
  try {
    // 发版后旧壳仍在内存：先对比入口 script，过期则硬刷新
    if (await reloadIfShellStale()) {
      return;
    }
    await Promise.all([
      prefetchRoute(path, { force: true }),
      prefetchLayoutShell({ force: true }),
    ]);
  } catch (e: unknown) {
    if (isChunkLoadError(e) && reloadForStaleChunk()) {
      return;
    }
    // 其它错误仍派发 commit，让界面有机会用已有缓存自愈
  } finally {
    if (id != null) doneTransition(id);
  }
  window.dispatchEvent(new Event(PAGE_SOFT_REFRESH_COMMIT_EVENT));
}
