import type { NavigateFunction } from 'react-router-dom';
import type { PostItem } from '../api/types';
import type { FeedSort } from '../components/FeedSortBar';
import {
  feedCacheKey,
  getHomeStoreState,
  type FeedCacheEntry,
} from '../store/homeStore';
import { clearSessionSnapshots } from './sessionPageCache';
import { softRefreshCurrentPage } from './softRefresh';
import { transitionTo } from './spaTransition';

/** 导航到帖子列表时附带的状态，用于同 URL 重复点击时强制刷新 */
export type FeedNavState = { refreshFeed?: boolean };

/** 对外暴露的缓存形状（兼容旧调用方；不含 lastFetchTime） */
export type FeedCache = {
  posts: PostItem[];
  postTotal: number;
  page: number;
  scrollTop: number;
};

function toPublic(entry: FeedCacheEntry): FeedCache {
  return {
    posts: entry.posts,
    postTotal: entry.postTotal,
    page: entry.page,
    scrollTop: entry.scrollTop,
  };
}

/** 读取帖子列表缓存（从详情页返回时恢复浏览位置） */
export function getFeedCache(
  boardId: number,
  keyword: string,
  sort: FeedSort,
  tag = '',
  author = '',
  titleOnly = false,
): FeedCache | null {
  const key = feedCacheKey({ boardId, keyword, sort, tag, author, titleOnly });
  const entry = getHomeStoreState().getFeed(key);
  return entry ? toPublic(entry) : null;
}

/** 保存帖子列表缓存（写入 Zustand，并记录拉取时间） */
export function setFeedCache(
  boardId: number,
  keyword: string,
  sort: FeedSort,
  data: FeedCache,
  tag = '',
  author = '',
  titleOnly = false,
) {
  const key = feedCacheKey({ boardId, keyword, sort, tag, author, titleOnly });
  getHomeStoreState().setFeed(key, data);
}

/** 清除所有帖子列表缓存（手动刷新 / 帖子变更时连详情快照一起作废） */
export function clearAllFeedCache() {
  getHomeStoreState().clearAll();
  clearSessionSnapshots('post:');
}

/** 主动刷新帖子列表时派发，用于同页内立即回到顶部 */
export const FEED_RESET_EVENT = 'feed-reset';

/** 手机下拉刷新（Feed 页）：强制重拉列表并重置滚动，不整页 reload */
export const FEED_PULL_REFRESH_EVENT = 'feed-pull-refresh';

/** 手机下拉：强制刷新当前前台页（绕过会话快照，非整页 reload） */
export const PAGE_FORCE_REFRESH_EVENT = 'page-force-refresh';

/** 当前浏览器地址是否已是目标 Feed URL（忽略 hash） */
function isSameFeedUrl(url: string): boolean {
  try {
    const target = new URL(url, window.location.origin);
    return (
      window.location.pathname === target.pathname
      && window.location.search === target.search
    );
  } catch {
    return false;
  }
}

/**
 * 导航到帖子列表。
 * 默认：等待预热后再换页；同 URL 或 `refresh: true` 时软刷新（带顶栏进度条）。
 */
export function navigateFeed(nav: NavigateFunction, url: string, opts?: { refresh?: boolean }) {
  const same = isSameFeedUrl(url);
  const refresh = opts?.refresh ?? same;
  if (refresh) {
    if (same) {
      void softRefreshCurrentPage(url, { progress: true });
      return;
    }
    void transitionTo(nav, url, {
      force: true,
      state: { refreshFeed: true } satisfies FeedNavState,
    });
    return;
  }
  void transitionTo(nav, url);
}
