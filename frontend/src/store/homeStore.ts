import { create } from 'zustand';
import type { PostItem } from '../api/types';
import type { FeedSort } from '../components/FeedSortBar';

/** 列表缓存过期时间：超过后返回首页时静默刷新，仍先展示旧数据 */
export const FEED_STALE_MS = 5 * 60 * 1000;

/** 单条 Feed 筛选对应的缓存快照 */
export type FeedCacheEntry = {
  posts: PostItem[];
  postTotal: number;
  page: number;
  scrollTop: number;
  /** 上次成功拉取 API 的时间戳（ms） */
  lastFetchTime: number;
};

type FeedKeyParts = {
  boardId: number;
  keyword: string;
  sort: FeedSort;
  tag?: string;
  author?: string;
  titleOnly?: boolean;
};

/** 与筛选条件一一对应的缓存键 */
export function feedCacheKey(parts: FeedKeyParts): string {
  const {
    boardId,
    keyword,
    sort,
    tag = '',
    author = '',
    titleOnly = false,
  } = parts;
  return `${boardId}:${keyword}:${tag}:${author}:${titleOnly ? 1 : 0}:${sort}`;
}

type HomeStoreState = {
  /** 按筛选键存放多份列表，首页 / 板块 / 搜索互不覆盖 */
  feeds: Record<string, FeedCacheEntry>;
  getFeed: (key: string) => FeedCacheEntry | null;
  setFeed: (key: string, data: Omit<FeedCacheEntry, 'lastFetchTime'> & { lastFetchTime?: number }) => void;
  /** 滚动时只更新 scrollTop，不改动列表数据 */
  patchScroll: (key: string, scrollTop: number) => void;
  isStale: (key: string, now?: number) => boolean;
  clearFeed: (key: string) => void;
  clearAll: () => void;
};

export const useHomeStore = create<HomeStoreState>((set, get) => ({
  feeds: {},

  getFeed: (key) => get().feeds[key] ?? null,

  setFeed: (key, data) => {
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          posts: data.posts,
          postTotal: data.postTotal,
          page: data.page,
          scrollTop: data.scrollTop,
          lastFetchTime: data.lastFetchTime ?? Date.now(),
        },
      },
    }));
  },

  patchScroll: (key, scrollTop) => {
    const prev = get().feeds[key];
    if (!prev) return;
    // 数值未变则跳过，减少无意义的 store 更新
    if (prev.scrollTop === scrollTop) return;
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: { ...prev, scrollTop },
      },
    }));
  },

  isStale: (key, now = Date.now()) => {
    const entry = get().feeds[key];
    if (!entry) return true;
    return now - entry.lastFetchTime > FEED_STALE_MS;
  },

  clearFeed: (key) => {
    set((state) => {
      if (!(key in state.feeds)) return state;
      const next = { ...state.feeds };
      delete next[key];
      return { feeds: next };
    });
  },

  clearAll: () => set({ feeds: {} }),
}));

/** 非 React 路径（如 feedCache 封装）直接读写 */
export function getHomeStoreState() {
  return useHomeStore.getState();
}
