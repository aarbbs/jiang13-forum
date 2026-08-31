import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
  useLocation,
  useParams,
  useNavigationType,
} from 'react-router-dom';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem } from '../api/types';
import type { LayoutCtx } from '../layouts/MainLayout';
import VirtualPostList from '../components/VirtualPostList';
import FeedHeader from '../components/FeedHeader';
import FeedSearchFilters from '../components/search/FeedSearchFilters';
import FeedPageSkeleton from '../components/FeedPageSkeleton';
import FeedSortBar, { parseFeedSort, buildHomeUrl, type FeedSort } from '../components/FeedSortBar';
import { useForumLimits } from '../hooks/useForumLimits';
import { parseSearchFromUrl, usePostSearch } from '../hooks/usePostSearch';
import {
  clearAllFeedCache,
  navigateFeed,
  FEED_RESET_EVENT,
  FEED_PULL_REFRESH_EVENT,
  type FeedNavState,
} from '../utils/feedCache';
import { feedCacheKey, getHomeStoreState } from '../store/homeStore';
import { openForumPost } from '../utils/openPost';
import { joinSEOKeywords, usePageSEO } from '../hooks/usePageSEO';
import { siteMetaDescription, useSiteBranding } from '../hooks/useSiteBranding';
import { boardPath, canonicalRedirectPath, parsePermalinkID } from '../utils/permalink';
import NotFoundPage from './NotFoundPage';

/** 仅从 URL 解析板块 ID（不以 layout 状态回退，避免回首页误用上一板块） */
function boardIdFromLocation(routeId: string | undefined, searchParams: URLSearchParams): number {
  if (routeId) {
    const id = parsePermalinkID(routeId);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }
  const q = Number(searchParams.get('board')) || 0;
  return q > 0 ? q : 0;
}

type FeedHydrate = {
  posts: PostItem[];
  postTotal: number;
  page: number;
  scrollTop: number;
  loading: boolean;
};

/** 首屏同步读取 Zustand，避免先骨架屏再恢复 */
function readHydrate(
  boardId: number,
  keyword: string,
  sort: FeedSort,
  tag: string,
  author: string,
  titleOnly: boolean,
): FeedHydrate {
  const key = feedCacheKey({ boardId, keyword, sort, tag, author, titleOnly });
  const cached = getHomeStoreState().getFeed(key);
  if (cached && cached.posts.length > 0) {
    return {
      posts: cached.posts,
      postTotal: cached.postTotal,
      page: cached.page,
      scrollTop: cached.scrollTop,
      loading: false,
    };
  }
  return { posts: [], postTotal: 0, page: 1, scrollTop: 0, loading: true };
}

export default function HomePage() {
  const nav = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
  const { id: boardRouteId } = useParams();
  const [params] = useSearchParams();
  const ctx = useOutletContext<LayoutCtx>();
  const { branding } = useSiteBranding();
  const { limits, loading: limitsLoading } = useForumLimits();
  const postSearch = usePostSearch(limits);
  const pageSize = Math.max(1, limits.page_size_default);

  const boardId = boardIdFromLocation(boardRouteId, params);
  const queryBoardId = Number(params.get('board')) || 0;
  const isBoardRoute = !!boardRouteId;
  const isInvalidBoardRoute = isBoardRoute && boardId === 0;
  const boardsLoading = ctx?.boardsLoading ?? true;
  const isMissingBoard = isBoardRoute && boardId > 0 && !boardsLoading && !(ctx?.boards ?? []).some(b => b.id === boardId);
  const keyword = params.get('keyword') || '';
  const tag = params.get('tag') || '';
  const author = params.get('author') || '';
  const titleOnly = params.get('title_only') === '1';
  const sort = parseFeedSort(params.get('sort'));
  const board = (ctx?.boards ?? []).find(b => b.id === boardId);
  const isSiteHome = !boardId && !keyword && !tag && !author;
  const siteIntro = siteMetaDescription(branding);
  const feedTitle = tag
    ? `标签：${tag}`
    : keyword || author
      ? '搜索结果'
      : (boardId && board ? board.name : '');
  usePageSEO({
    title: feedTitle || undefined,
    description: board?.description?.trim() || siteIntro,
    keywords: joinSEOKeywords(board?.name, tag, branding.keywords),
    canonicalPath: tag
      ? `/?tag=${encodeURIComponent(tag)}`
      : boardId
        ? boardPath(boardId, limits)
        : '/',
    ogType: 'website',
  });

  // 旧版 /?board=id 重定向到规范板块路径
  useEffect(() => {
    if (queryBoardId && !boardRouteId) {
      const p = new URLSearchParams(params);
      p.delete('board');
      const qs = p.toString();
      const target = boardPath(queryBoardId, limits) + (qs ? `?${qs}` : '');
      nav(target, { replace: true });
      return;
    }
    if (boardRouteId && boardId > 0) {
      const redirect = canonicalRedirectPath('board', boardId, location.pathname, limits);
      if (redirect) {
        const qs = location.search;
        nav(redirect + qs, { replace: true });
      }
    }
  }, [queryBoardId, boardId, boardRouteId, params, nav, limits, location.pathname, location.search]);

  const cacheKey = useMemo(
    () => feedCacheKey({ boardId, keyword, sort, tag, author, titleOnly }),
    [boardId, keyword, sort, tag, author, titleOnly],
  );

  // 筛选键变化时同步水合（含首次挂载），保证第一帧就有列表数据
  const initial = useMemo(
    () => readHydrate(boardId, keyword, sort, tag, author, titleOnly),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随筛选键变化重置
    [cacheKey],
  );

  const [posts, setPosts] = useState<PostItem[]>(initial.posts);
  const [postTotal, setPostTotal] = useState(initial.postTotal);
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(initial.loading);
  const [restoreScrollTop, setRestoreScrollTop] = useState<number | null>(
    initial.posts.length > 0 ? initial.scrollTop : null,
  );
  const [listResetKey, setListResetKey] = useState(0);

  const scrollTopRef = useRef(initial.scrollTop);
  const loadingRef = useRef(false);
  const pageRef = useRef(initial.page);
  const cacheKeyRef = useRef(cacheKey);
  const scrollRafRef = useRef(0);
  /** 当前筛选键是否已完成「进入页」水合（避免 effect 重跑时反复 setRestoreScrollTop） */
  const hydratedKeyRef = useRef<string | null>(null);
  pageRef.current = page;
  cacheKeyRef.current = cacheKey;

  // 筛选键切换：用新键的缓存重置本地 state（useMemo initial 不会自动 setState）
  useEffect(() => {
    const next = readHydrate(boardId, keyword, sort, tag, author, titleOnly);
    hydratedKeyRef.current = null;
    setPosts(next.posts);
    setPostTotal(next.postTotal);
    setPage(next.page);
    pageRef.current = next.page;
    scrollTopRef.current = next.scrollTop;
    setRestoreScrollTop(next.posts.length > 0 ? next.scrollTop : null);
    setLoading(next.loading);
  }, [cacheKey, boardId, keyword, sort, tag, author, titleOnly]);

  const totalPages = Math.max(1, Math.ceil(Math.max(postTotal, 0) / pageSize));
  const showPagination = totalPages > 1 && posts.length > 0;
  const hasMore = page < totalPages;

  const resetFeedView = useCallback(() => {
    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    setListResetKey(k => k + 1);
  }, []);

  /** 强制刷新：清空全部 Feed 缓存并滚回顶部 */
  const beginFeedRefresh = useCallback(() => {
    clearAllFeedCache();
    resetFeedView();
  }, [resetFeedView]);

  /** 把当前列表写入 Zustand（滚动位置用 ref，避免闭包过期） */
  const persistFeed = useCallback((
    nextPosts: PostItem[],
    nextTotal: number,
    nextPage: number,
    opts?: { scrollTop?: number; touchFetchTime?: boolean },
  ) => {
    const key = cacheKeyRef.current;
    const prev = getHomeStoreState().getFeed(key);
    getHomeStoreState().setFeed(key, {
      posts: nextPosts,
      postTotal: nextTotal,
      page: nextPage,
      scrollTop: opts?.scrollTop ?? scrollTopRef.current,
      lastFetchTime: opts?.touchFetchTime === false
        ? (prev?.lastFetchTime ?? Date.now())
        : Date.now(),
    });
  }, []);

  const fetchPage = useCallback(async (p: number, opts?: { silent?: boolean }) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const silent = !!opts?.silent;
    // 静默刷新：保留现有列表，不展示加载骨架
    if (!silent) setLoading(true);
    try {
      const data = await api.posts({
        page: p,
        size: pageSize,
        board_id: boardId || '',
        keyword: tag ? '' : keyword,
        tag: tag || '',
        author: tag ? '' : author,
        title_only: !tag && titleOnly ? '1' : '',
        sort,
      });
      const batch = Array.isArray(data.posts) ? data.posts : [];
      const total = data.total ?? 0;
      setPosts(batch);
      setPostTotal(total);
      setPage(p);
      pageRef.current = p;
      persistFeed(batch, total, p, { touchFetchTime: true });
    } catch (e: unknown) {
      if (!silent) {
        notify.error(e instanceof Error ? e.message : '加载失败');
        setPosts([]);
        setPostTotal(0);
        setPage(1);
        pageRef.current = 1;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [boardId, keyword, tag, author, titleOnly, sort, pageSize, persistFeed]);

  const loadFirst = useCallback(() => fetchPage(1), [fetchPage]);

  const goToPage = useCallback((p: number) => {
    if (loadingRef.current) return;
    const maxPage = Math.max(1, Math.ceil(Math.max(postTotal, 0) / pageSize));
    if (p < 1 || p > maxPage) return;
    if (p === pageRef.current) return;
    resetFeedView();
    getHomeStoreState().patchScroll(cacheKeyRef.current, 0);
    fetchPage(p);
  }, [fetchPage, postTotal, pageSize, resetFeedView]);

  const handleSelectPost = useCallback((id: number) => {
    // 离开前再写一次滚动，确保详情页返回可还原
    getHomeStoreState().patchScroll(cacheKeyRef.current, scrollTopRef.current);
    openForumPost(nav, id, limits.open_posts_in_new_tab);
  }, [nav, limits.open_posts_in_new_tab]);

  // 等限制就绪后再决定：强制刷新 / 用缓存 / 静默刷新 / 首拉
  useEffect(() => {
    if (limitsLoading || isInvalidBoardRoute || isMissingBoard) return;

    const forceRefresh = (location.state as FeedNavState | null)?.refreshFeed;
    // 浏览器后退/前进（POP）忽略 history 上残留的 refreshFeed，避免误清空缓存
    if (forceRefresh && navType !== 'POP') {
      hydratedKeyRef.current = cacheKey;
      beginFeedRefresh();
      setPosts([]);
      setPostTotal(0);
      setPage(1);
      pageRef.current = 1;
      setLoading(true);
      loadFirst();
      // 消费后清掉 state，防止该 history 条目永远带着刷新标记
      nav(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
      return;
    }

    // POP 带回 refreshFeed 时也清掉，避免下次同条目再误触发
    if (forceRefresh && navType === 'POP') {
      nav(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
    }

    const cached = getHomeStoreState().getFeed(cacheKey);
    if (cached && cached.posts.length > 0) {
      const needRestore = hydratedKeyRef.current !== cacheKey;
      hydratedKeyRef.current = cacheKey;
      setPosts(cached.posts);
      setPostTotal(cached.postTotal);
      setPage(cached.page);
      pageRef.current = cached.page;
      setLoading(false);
      // 仅在「首次进入该筛选」时恢复滚动，避免 limits/pageSize 变化导致 effect 重跑时打断用户滚动
      if (needRestore) {
        setRestoreScrollTop(cached.scrollTop);
        scrollTopRef.current = cached.scrollTop;
      }
      // 超过 TTL：后台静默刷新，不重置滚动
      if (getHomeStoreState().isStale(cacheKey)) {
        void fetchPage(cached.page, { silent: true });
      }
      return;
    }

    hydratedKeyRef.current = cacheKey;
    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    loadFirst();
  }, [
    limitsLoading,
    pageSize,
    cacheKey,
    location.key,
    location.state,
    location.pathname,
    location.search,
    location.hash,
    navType,
    nav,
    loadFirst,
    fetchPage,
    beginFeedRefresh,
    isInvalidBoardRoute,
    isMissingBoard,
  ]);

  useEffect(() => {
    const onFeedReset = () => beginFeedRefresh();
    window.addEventListener(FEED_RESET_EVENT, onFeedReset);
    return () => window.removeEventListener(FEED_RESET_EVENT, onFeedReset);
  }, [beginFeedRefresh]);

  useEffect(() => {
    // Logo / 下拉刷新 / 后台改帖：清空本地列表以露出骨架，再强制拉第 1 页
    const fn = () => {
      beginFeedRefresh();
      setPosts([]);
      setPostTotal(0);
      setPage(1);
      pageRef.current = 1;
      setLoading(true);
      loadFirst();
    };
    window.addEventListener('posts-refresh', fn);
    window.addEventListener(FEED_PULL_REFRESH_EVENT, fn);
    return () => {
      window.removeEventListener('posts-refresh', fn);
      window.removeEventListener(FEED_PULL_REFRESH_EVENT, fn);
    };
  }, [beginFeedRefresh, loadFirst]);

  // 卸载时取消未执行的 scroll rAF
  useEffect(() => () => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  const handleScrollTopChange = useCallback((top: number) => {
    scrollTopRef.current = top;
    // rAF 节流写入 store，避免每个 scroll 事件都触发订阅者
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      getHomeStoreState().patchScroll(cacheKeyRef.current, scrollTopRef.current);
    });
  }, []);

  const handleSortChange = (next: FeedSort) => {
    if (next === sort) {
      beginFeedRefresh();
      loadFirst();
      return;
    }
    navigateFeed(nav, buildHomeUrl(boardId, next, { keyword, tag, author, titleOnly, permalink: limits }));
  };

  const showSortBar = !keyword && !tag && !author;
  const searchFilters = parseSearchFromUrl(location.pathname, params);
  const isSearchActive = !!(keyword || author);

  if (isInvalidBoardRoute || isMissingBoard) {
    return (
      <NotFoundPage
        title="板块不存在"
        description="该板块不存在，或已被删除。"
      />
    );
  }

  // 首屏用同构骨架，避免标题/列表分区先后出现造成闪动
  if ((loading || limitsLoading || (isBoardRoute && boardsLoading)) && posts.length === 0) {
    return <FeedPageSkeleton />;
  }

  return (
    <div className="page-wrap page-wrap--feed">
      <div className="feed-panel">
        <div className="feed-top">
          <div className="feed-top__bar">
            <FeedHeader
              keyword={keyword}
              tag={tag}
              author={author}
              postTotal={postTotal}
              titleAs={isSiteHome ? 'h2' : 'h1'}
            />
            {showSortBar && (
              <FeedSortBar value={sort} onChange={handleSortChange} postTotal={postTotal} />
            )}
          </div>
          {isSearchActive && (
            <FeedSearchFilters
              filters={postSearch.filters}
              boards={ctx?.boards ?? []}
              onRemove={postSearch.removeFilter}
              onClear={postSearch.clearSearch}
            />
          )}
        </div>
        <VirtualPostList
          posts={posts}
          sort={sort}
          loading={loading || limitsLoading}
          hasMore={hasMore}
          showPagination={showPagination}
          page={page}
          totalPages={totalPages}
          postTotal={postTotal}
          onPageChange={goToPage}
          onSelect={handleSelectPost}
          restoreScrollTop={restoreScrollTop}
          resetScrollKey={listResetKey}
          onScrollTopChange={handleScrollTopChange}
          onScrollRestored={() => setRestoreScrollTop(null)}
          keyword={keyword || tag || author}
          isSearchMode={!!(keyword || author)}
          searchKeyword={keyword}
          searchAuthor={author}
          searchTitleOnly={titleOnly}
          searchScopeBoardId={searchFilters.scopeBoardId}
          onClearSearch={postSearch.clearSearch}
          boardId={boardId}
          boardName={ctx?.boards?.find(b => b.id === boardId)?.name || ''}
          noBoards={!ctx?.boardsLoading && (ctx?.boards?.length ?? 0) === 0}
        />
      </div>
    </div>
  );
}
