import type { NavigateFunction } from 'react-router-dom';
import type { PostItem } from '../api/types';
import type { FeedSort } from '../components/FeedSortBar';

/** 导航到帖子列表时附带的状态，用于同 URL 重复点击时强制刷新 */
export type FeedNavState = { refreshFeed?: boolean };



export type FeedCache = {

  posts: PostItem[];

  postTotal: number;

  page: number;

  hasMore: boolean;

  scrollTop: number;

};



const PREFIX = 'j13-feed-cache:';



function cacheKey(boardId: number, keyword: string, sort: FeedSort) {

  return `${PREFIX}${boardId}:${keyword}:${sort}`;

}



/** 读取帖子列表缓存，用于从详情页返回时恢复浏览位置 */

export function getFeedCache(boardId: number, keyword: string, sort: FeedSort): FeedCache | null {

  try {

    const raw = sessionStorage.getItem(cacheKey(boardId, keyword, sort));

    return raw ? (JSON.parse(raw) as FeedCache) : null;

  } catch {

    return null;

  }

}



/** 保存帖子列表缓存 */

export function setFeedCache(boardId: number, keyword: string, sort: FeedSort, data: FeedCache) {

  try {

    sessionStorage.setItem(cacheKey(boardId, keyword, sort), JSON.stringify(data));

  } catch {

    // sessionStorage 不可用时忽略

  }

}



/** 清除指定筛选条件下的列表缓存 */

export function clearFeedCache(boardId: number, keyword: string, sort: FeedSort) {

  try {

    sessionStorage.removeItem(cacheKey(boardId, keyword, sort));

  } catch {

    // ignore

  }

}



/** 清除所有帖子列表缓存（置顶等操作后列表需全量刷新） */
export function clearAllFeedCache() {

  try {

    for (let i = sessionStorage.length - 1; i >= 0; i--) {

      const key = sessionStorage.key(i);

      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);

    }

  } catch {

    // ignore

  }

}

/** 主动刷新帖子列表时派发，用于同页内立即回到顶部 */
export const FEED_RESET_EVENT = 'feed-reset';

/** 清除缓存并导航到帖子列表（重复点击同一入口时也会刷新） */
export function navigateFeed(nav: NavigateFunction, url: string) {
  clearAllFeedCache();
  window.dispatchEvent(new Event(FEED_RESET_EVENT));
  nav(url, { state: { refreshFeed: true } satisfies FeedNavState });
}
