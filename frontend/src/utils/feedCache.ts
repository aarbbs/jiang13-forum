import type { NavigateFunction } from 'react-router-dom';
import type { PostItem } from '../api/types';
import type { FeedSort } from '../components/FeedSortBar';

/** 导航到帖子列表时附带的状态，用于同 URL 重复点击时强制刷新 */
export type FeedNavState = { refreshFeed?: boolean };

export type FeedCache = {
  posts: PostItem[];
  postTotal: number;
  page: number;
  scrollTop: number;
};

/** 仅存内存：SPA 内返回可恢复，浏览器刷新自动清空 */
const store = new Map<string, FeedCache>();

function cacheKey(boardId: number, keyword: string, sort: FeedSort) {
  return `${boardId}:${keyword}:${sort}`;
}

/** 读取帖子列表缓存（从详情页返回时恢复浏览位置） */
export function getFeedCache(boardId: number, keyword: string, sort: FeedSort): FeedCache | null {
  return store.get(cacheKey(boardId, keyword, sort)) ?? null;
}

/** 保存帖子列表缓存 */
export function setFeedCache(boardId: number, keyword: string, sort: FeedSort, data: FeedCache) {
  store.set(cacheKey(boardId, keyword, sort), data);
}

/** 清除所有帖子列表缓存 */
export function clearAllFeedCache() {
  store.clear();
}

/** 主动刷新帖子列表时派发，用于同页内立即回到顶部 */
export const FEED_RESET_EVENT = 'feed-reset';

/** 清除缓存并导航到帖子列表（重复点击同一入口时也会刷新） */
export function navigateFeed(nav: NavigateFunction, url: string) {
  clearAllFeedCache();
  window.dispatchEvent(new Event(FEED_RESET_EVENT));
  nav(url, { state: { refreshFeed: true } satisfies FeedNavState });
}
