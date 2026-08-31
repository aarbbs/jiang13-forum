import type { NavigateFunction } from 'react-router-dom';
import type { PostItem } from '../api/types';
import type { FeedSort } from '../components/FeedSortBar';
import {
  feedCacheKey,
  getHomeStoreState,
  type FeedCacheEntry,
} from '../store/homeStore';

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

/** 清除所有帖子列表缓存 */
export function clearAllFeedCache() {
  getHomeStoreState().clearAll();
}

/** 主动刷新帖子列表时派发，用于同页内立即回到顶部 */
export const FEED_RESET_EVENT = 'feed-reset';

/** 手机下拉刷新（Feed 页）：强制重拉列表并重置滚动，不整页 reload */
export const FEED_PULL_REFRESH_EVENT = 'feed-pull-refresh';

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
 * 清除缓存并导航到帖子列表。
 * 已在目标 URL（如首页再点 Logo）时额外派发强制重拉，不依赖 RR 是否换 key。
 */
export function navigateFeed(nav: NavigateFunction, url: string) {
  clearAllFeedCache();
  window.dispatchEvent(new Event(FEED_RESET_EVENT));
  // 同 URL 再点（典型：左上角 Logo）：必须立刻重拉，否则可能只清缓存、界面仍显示旧列表
  if (isSameFeedUrl(url)) {
    window.dispatchEvent(new Event(FEED_PULL_REFRESH_EVENT));
  }
  nav(url, { state: { refreshFeed: true } satisfies FeedNavState });
}
