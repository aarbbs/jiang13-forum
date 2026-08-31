import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { buildHomeUrl } from '../components/FeedSortBar';
import { navigateFeed } from '../utils/feedCache';
import { transitionTo } from '../utils/spaTransition';
import { notify } from '@/lib/notify';
import { parsePermalinkID, type PermalinkOpts } from '../utils/permalink';

/** 打开搜索面板（全局事件） */
export const POST_SEARCH_OPEN_EVENT = 'post-search-open';

export type SearchFilterKey = 'keyword' | 'author' | 'titleOnly' | 'board';

export interface PostSearchSubmitInput {
  keyword?: string;
  author?: string;
  titleOnly?: boolean;
  /** 0 = 全站，>0 = 限定板块 */
  scopeBoardId?: number;
}

export interface PostSearchState {
  keyword: string;
  author: string;
  titleOnly: boolean;
  scopeBoardId: number;
  contextBoardId: number;
  isFiltered: boolean;
  hasAdvancedFilters: boolean;
}

export interface RecentSearch {
  keyword: string;
  author: string;
  titleOnly: boolean;
  scopeBoardId: number;
  at: number;
}

const RECENT_KEY = 'jiang13-recent-searches';
const RECENT_MAX = 5;

export function parseBoardIdFromLocation(pathname: string, params: URLSearchParams): number {
  const m = pathname.match(/^\/board\/(\d+(?:\.[A-Za-z0-9]{1,16})?)$/);
  if (m) return parsePermalinkID(m[1]) || 0;
  const q = Number(params.get('board')) || 0;
  return q > 0 ? q : 0;
}

export function parseSearchFromUrl(
  pathname: string,
  params: URLSearchParams,
): Pick<PostSearchState, 'keyword' | 'author' | 'titleOnly' | 'scopeBoardId'> {
  const keyword = params.get('keyword') || '';
  const author = params.get('author') || '';
  const titleOnly = params.get('title_only') === '1';
  const pathBoardId = parseBoardIdFromLocation(pathname, params);
  const scopeBoardId = (keyword || author) && pathBoardId > 0 ? pathBoardId : 0;
  return { keyword, author, titleOnly, scopeBoardId };
}

function readRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearch[];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(items: RecentSearch[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_MAX)));
  } catch {
    /* 忽略存储失败 */
  }
}

export function saveRecentSearch(entry: Omit<RecentSearch, 'at'>) {
  const kw = entry.keyword.trim();
  const author = entry.author.trim();
  if (!kw && !author) return;
  const next: RecentSearch = { ...entry, keyword: kw, author, at: Date.now() };
  const prev = readRecentSearches().filter(
    (r) => !(r.keyword === next.keyword && r.author === next.author
      && r.titleOnly === next.titleOnly && r.scopeBoardId === next.scopeBoardId),
  );
  writeRecentSearches([next, ...prev]);
}

export function getRecentSearches(): RecentSearch[] {
  return readRecentSearches();
}

function validateKeyword(kw: string, limits: PermalinkOpts & { search_keyword_min: number; search_keyword_max: number }): boolean {
  if (!kw) return true;
  const len = [...kw].length;
  if (limits.search_keyword_min > 0 && len < limits.search_keyword_min) {
    notify.warning(`搜索关键词至少 ${limits.search_keyword_min} 个字`);
    return false;
  }
  if (limits.search_keyword_max > 0 && len > limits.search_keyword_max) {
    notify.warning(`搜索关键词最多 ${limits.search_keyword_max} 个字`);
    return false;
  }
  return true;
}

function isSameSearchTarget(
  pathname: string,
  params: URLSearchParams,
  target: string,
  input: Required<Pick<PostSearchSubmitInput, 'keyword' | 'author' | 'titleOnly' | 'scopeBoardId'>>,
): boolean {
  const active = parseSearchFromUrl(pathname, params);
  const activeBoard = parseBoardIdFromLocation(pathname, params);
  const onFeed = pathname === '/' || /^\/board\/\d+/.test(pathname);
  return onFeed
    && active.keyword === input.keyword
    && active.author === input.author
    && active.titleOnly === input.titleOnly
    && (input.scopeBoardId > 0 ? activeBoard === input.scopeBoardId : active.scopeBoardId === 0);
}

export function usePostSearch(
  limits: PermalinkOpts & { search_keyword_min: number; search_keyword_max: number },
) {
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();

  const contextBoardId = useMemo(
    () => parseBoardIdFromLocation(loc.pathname, params),
    [loc.pathname, params],
  );

  const filters = useMemo((): PostSearchState => {
    const parsed = parseSearchFromUrl(loc.pathname, params);
    const isFiltered = !!(parsed.keyword || parsed.author);
    const hasAdvancedFilters = !!(
      parsed.author
      || (parsed.titleOnly && parsed.keyword)
      || parsed.scopeBoardId > 0
    );
    return { ...parsed, contextBoardId, isFiltered, hasAdvancedFilters };
  }, [loc.pathname, params, contextBoardId]);

  const buildUrl = useCallback((input: PostSearchSubmitInput) => {
    const kw = (input.keyword ?? '').trim();
    const author = (input.author ?? '').trim();
    const titleOnly = !!kw && (input.titleOnly ?? false);
    const scopeBoard = input.scopeBoardId ?? 0;
    return buildHomeUrl(scopeBoard, 'latest', {
      keyword: kw,
      author,
      titleOnly,
      permalink: limits,
    });
  }, [limits]);

  const submitSearch = useCallback((
    input: PostSearchSubmitInput,
    opts?: { refreshIfSame?: boolean },
  ) => {
    const kw = (input.keyword ?? '').trim();
    const author = (input.author ?? '').trim();
    const activeKw = (params.get('keyword') || '').trim();
    const activeAuthor = (params.get('author') || '').trim();

    if (!kw && !author) {
      if (activeKw || activeAuthor) navigateFeed(nav, '/');
      return false;
    }
    if (!validateKeyword(kw, limits)) return false;

    const titleOnly = !!kw && (input.titleOnly ?? false);
    const scopeBoardId = input.scopeBoardId ?? 0;
    const target = buildUrl({ keyword: kw, author, titleOnly, scopeBoardId });
    const normalized = {
      keyword: kw,
      author,
      titleOnly,
      scopeBoardId,
    };

    if (isSameSearchTarget(loc.pathname, params, target, normalized)) {
      if (opts?.refreshIfSame) navigateFeed(nav, target);
      return true;
    }

    saveRecentSearch({ keyword: kw, author, titleOnly, scopeBoardId });
    void transitionTo(nav, target);
    return true;
  }, [nav, params, loc.pathname, limits, buildUrl]);

  const clearSearch = useCallback(() => {
    navigateFeed(nav, '/');
  }, [nav]);

  const removeFilter = useCallback((key: SearchFilterKey) => {
    const current = parseSearchFromUrl(loc.pathname, params);
    if (!current.keyword && !current.author) return;

    let next: PostSearchSubmitInput;
    switch (key) {
      case 'keyword':
        next = {
          keyword: '',
          author: current.author,
          titleOnly: false,
          scopeBoardId: current.scopeBoardId,
        };
        break;
      case 'author':
        next = {
          keyword: current.keyword,
          author: '',
          titleOnly: current.titleOnly,
          scopeBoardId: current.scopeBoardId,
        };
        break;
      case 'titleOnly':
        next = {
          keyword: current.keyword,
          author: current.author,
          titleOnly: false,
          scopeBoardId: current.scopeBoardId,
        };
        break;
      case 'board':
        next = {
          keyword: current.keyword,
          author: current.author,
          titleOnly: current.titleOnly,
          scopeBoardId: 0,
        };
        break;
      default:
        return;
    }

    const kw = (next.keyword ?? '').trim();
    const author = (next.author ?? '').trim();
    if (!kw && !author) {
      clearSearch();
      return;
    }
    nav(buildUrl({
      keyword: kw,
      author,
      titleOnly: next.titleOnly,
      scopeBoardId: next.scopeBoardId,
    }));
  }, [loc.pathname, params, nav, buildUrl, clearSearch]);

  return {
    filters,
    buildUrl,
    submitSearch,
    clearSearch,
    removeFilter,
    getRecentSearches,
    saveRecentSearch,
  };
}

export function dispatchOpenPostSearch() {
  window.dispatchEvent(new CustomEvent(POST_SEARCH_OPEN_EVENT));
}
