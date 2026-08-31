import { useState, useEffect, useCallback, useRef, useMemo, startTransition as reactStartTransition } from 'react';
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
import StaticFeedList from '../components/StaticFeedList';
import FeedHeader from '../components/FeedHeader';
import FeedSearchFilters from '../components/search/FeedSearchFilters';
import FeedSortBar, { parseFeedSort, buildHomeUrl, type FeedSort } from '../components/FeedSortBar';
import { useForumLimits } from '../hooks/useForumLimits';
import { parseSearchFromUrl, usePostSearch } from '../hooks/usePostSearch';
import {
  navigateFeed,
  FEED_RESET_EVENT,
  FEED_PULL_REFRESH_EVENT,
  type FeedNavState,
} from '../utils/feedCache';
import { PAGE_SOFT_REFRESH_COMMIT_EVENT } from '../utils/softRefresh';
import { feedCacheKey, getHomeStoreState } from '../store/homeStore';
import { enabledFeedSortTabs, getDefaultFeedSort } from '../utils/feedSortTabs';
import { openForumPost } from '../utils/openPost';
import { startTransition, doneTransition } from '../utils/spaTransition';
import { isHomeHydrating } from '../utils/homeHydrate';
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
  const rawSort = params.get('sort');
  const sort = parseFeedSort(rawSort, limits.feed_sort_tabs);
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

  // URL 上的 sort 已被后台关闭时，纠正为默认排序
  useEffect(() => {
    if (limitsLoading) return;
    if (rawSort !== 'latest' && rawSort !== 'hot' && rawSort !== 'reply') return;
    const stillOn = enabledFeedSortTabs(limits.feed_sort_tabs).some(t => t.id === rawSort);
    if (stillOn) return;
    const def = getDefaultFeedSort(limits.feed_sort_tabs);
    nav(buildHomeUrl(boardId, def, { keyword, tag, author, titleOnly, permalink: limits }), { replace: true });
  }, [
    limitsLoading,
    limits.feed_sort_tabs,
    limits,
    rawSort,
    boardId,
    keyword,
    tag,
    author,
    titleOnly,
    nav,
  ]);

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
  /** 画面上已提交的筛选（URL 已变但数据未到时仍画上一份） */
  const [view, setView] = useState({
    cacheKey,
    sort,
    boardId,
    keyword,
    tag,
    author,
    titleOnly,
  });
  const [listPending, setListPending] = useState(false);
  const [restoreScrollTop, setRestoreScrollTop] = useState<number | null>(
    initial.posts.length > 0 ? initial.scrollTop : null,
  );
  const [listResetKey, setListResetKey] = useState(0);
  /** hydrate 首帧用静态列表；完成后升级 VirtualPostList */
  const [useVirtualList, setUseVirtualList] = useState(() => !isHomeHydrating());

  useEffect(() => {
    if (useVirtualList) return;
    reactStartTransition(() => setUseVirtualList(true));
  }, [useVirtualList]);

  const scrollTopRef = useRef(initial.scrollTop);
  const fetchSeqRef = useRef(0);
  const pageRef = useRef(initial.page);
  const cacheKeyRef = useRef(cacheKey);
  const viewKeyRef = useRef(view.cacheKey);
  const postsRef = useRef(posts);
  const scrollRafRef = useRef(0);
  /** 当前筛选键是否已完成「进入页」水合（避免 effect 重跑时反复 setRestoreScrollTop） */
  const hydratedKeyRef = useRef<string | null>(null);
  /** 强制刷新已发起 loadFirst：消费 refreshFeed 后 effect 再跑时勿因空缓存重复请求 */
  const refreshFetchKeyRef = useRef<string | null>(null);
  pageRef.current = page;
  cacheKeyRef.current = cacheKey;
  viewKeyRef.current = view.cacheKey;
  postsRef.current = posts;

  const commitDisplayed = useCallback((
    next: FeedHydrate,
    meta: { cacheKey: string; sort: FeedSort; boardId: number; keyword: string; tag: string; author: string; titleOnly: boolean },
  ) => {
    setPosts(next.posts);
    setPostTotal(next.postTotal);
    setPage(next.page);
    pageRef.current = next.page;
    scrollTopRef.current = next.scrollTop;
    setRestoreScrollTop(next.posts.length > 0 ? next.scrollTop : null);
    setLoading(next.loading);
    setListPending(false);
    setView(meta);
  }, []);

  // 筛选键切换：有快照则立刻换页；否则保留当前画面等请求结束
  useEffect(() => {
    if ((location.state as FeedNavState | null)?.refreshFeed && navType !== 'POP') {
      hydratedKeyRef.current = null;
      return;
    }
    const next = readHydrate(boardId, keyword, sort, tag, author, titleOnly);
    if (next.posts.length > 0) {
      hydratedKeyRef.current = cacheKey;
      commitDisplayed(next, { cacheKey, sort, boardId, keyword, tag, author, titleOnly });
      return;
    }
    hydratedKeyRef.current = null;
    if (postsRef.current.length > 0) {
      setListPending(true);
      setLoading(false);
      return;
    }
    commitDisplayed(next, { cacheKey, sort, boardId, keyword, tag, author, titleOnly });
  }, [cacheKey, boardId, keyword, sort, tag, author, titleOnly, commitDisplayed, location.state, navType]);

  const totalPages = Math.max(1, Math.ceil(Math.max(postTotal, 0) / pageSize));
  const showPagination = totalPages > 1 && posts.length > 0;
  const hasMore = page < totalPages;

  const resetFeedView = useCallback(() => {
    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    setListResetKey(k => k + 1);
  }, []);

  /** 同筛选强制刷新：只复位滚动，保留旧列表直到 loadFirst 覆盖 */
  const beginFeedRefresh = useCallback(() => {
    resetFeedView();
  }, [resetFeedView]);

  /** 把当前列表写入 Zustand（滚动位置用 ref，避免闭包过期） */
  const persistFeed = useCallback((
    nextPosts: PostItem[],
    nextTotal: number,
    nextPage: number,
    opts?: { scrollTop?: number; touchFetchTime?: boolean; key?: string },
  ) => {
    const key = opts?.key ?? cacheKeyRef.current;
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

  const fetchPage = useCallback(async (p: number, opts?: { silent?: boolean; resetScroll?: boolean }) => {
    const seq = ++fetchSeqRef.current;
    const requestKey = cacheKeyRef.current;
    const silent = !!opts?.silent;
    const keepView = postsRef.current.length > 0;
    // 有旧列表时不卸页，只标 pending
    if (!silent && !keepView) setLoading(true);
    if (!silent && keepView) setListPending(true);
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
      if (seq !== fetchSeqRef.current) return;
      const batch = Array.isArray(data.posts) ? data.posts : [];
      const total = data.total ?? 0;
      const jumpTop = opts?.resetScroll || (keepView && requestKey !== viewKeyRef.current);
      const scrollTop = jumpTop ? 0 : scrollTopRef.current;
      if (jumpTop) {
        setRestoreScrollTop(null);
        scrollTopRef.current = 0;
        setListResetKey(k => k + 1);
      }
      setPosts(batch);
      setPostTotal(total);
      setPage(p);
      pageRef.current = p;
      setView({ cacheKey: requestKey, sort, boardId, keyword, tag, author, titleOnly });
      persistFeed(batch, total, p, { scrollTop, touchFetchTime: true, key: requestKey });
    } catch (e: unknown) {
      if (seq !== fetchSeqRef.current) return;
      if (!silent) {
        notify.error(e instanceof Error ? e.message : '加载失败');
        if (!keepView) {
          setPosts([]);
          setPostTotal(0);
          setPage(1);
          pageRef.current = 1;
        }
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setListPending(false);
      }
    }
  }, [boardId, keyword, tag, author, titleOnly, sort, pageSize, persistFeed]);

  const loadFirst = useCallback((opts?: { resetScroll?: boolean }) => (
    fetchPage(1, { resetScroll: opts?.resetScroll })
  ), [fetchPage]);

  const goToPage = useCallback((p: number) => {
    const maxPage = Math.max(1, Math.ceil(Math.max(postTotal, 0) / pageSize));
    if (p < 1 || p > maxPage) return;
    if (p === pageRef.current) return;
    void fetchPage(p, { resetScroll: true });
  }, [fetchPage, postTotal, pageSize]);

  const handleSelectPost = useCallback((id: number) => {
    // 离开前再写一次滚动，确保详情页返回可还原
    getHomeStoreState().patchScroll(viewKeyRef.current, scrollTopRef.current);
    openForumPost(nav, id, limits.open_posts_in_new_tab);
  }, [nav, limits.open_posts_in_new_tab]);

  // 等限制就绪后再决定：强制刷新 / 用缓存 / 静默刷新 / 首拉
  useEffect(() => {
    if (limitsLoading || isInvalidBoardRoute || isMissingBoard) return;

    const forceRefresh = (location.state as FeedNavState | null)?.refreshFeed;
    // 浏览器后退/前进（POP）忽略 history 上残留的 refreshFeed，避免误清空缓存
    if (forceRefresh && navType !== 'POP') {
      fetchSeqRef.current += 1;
      hydratedKeyRef.current = cacheKey;
      refreshFetchKeyRef.current = cacheKey;
      // 排序等强制刷新：丢弃该键旧分页/滚动，置顶重拉第 1 页
      getHomeStoreState().clearFeed(cacheKey);
      resetFeedView();
      setListPending(postsRef.current.length > 0);
      if (postsRef.current.length === 0) setLoading(true);
      setView({ cacheKey, sort, boardId, keyword, tag, author, titleOnly });
      void loadFirst({ resetScroll: true });
      // 消费后清掉 state，防止该 history 条目永远带着刷新标记
      nav(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
      return;
    }

    // POP 带回 refreshFeed 时也清掉，避免下次同条目再误触发
    if (forceRefresh && navType === 'POP') {
      nav(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
    }

    // 刚强制刷新并清缓存：跳过随后因 state 清空触发的空缓存首拉
    if (refreshFetchKeyRef.current === cacheKey) {
      refreshFetchKeyRef.current = null;
      return;
    }

    const cached = getHomeStoreState().getFeed(cacheKey);
    if (cached && cached.posts.length > 0) {
      const needRestore = hydratedKeyRef.current !== cacheKey;
      hydratedKeyRef.current = cacheKey;
      if (needRestore) {
        commitDisplayed({
          posts: cached.posts,
          postTotal: cached.postTotal,
          page: cached.page,
          scrollTop: cached.scrollTop,
          loading: false,
        }, { cacheKey, sort, boardId, keyword, tag, author, titleOnly });
      } else {
        setPosts(cached.posts);
        setPostTotal(cached.postTotal);
        setPage(cached.page);
        pageRef.current = cached.page;
        setLoading(false);
        setListPending(false);
        setView({ cacheKey, sort, boardId, keyword, tag, author, titleOnly });
      }
      return;
    }

    hydratedKeyRef.current = cacheKey;
    if (postsRef.current.length === 0) {
      setRestoreScrollTop(null);
      scrollTopRef.current = 0;
    }
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
    commitDisplayed,
    resetFeedView,
    isInvalidBoardRoute,
    isMissingBoard,
    sort,
    boardId,
    keyword,
    tag,
    author,
    titleOnly,
  ]);

  useEffect(() => {
    // Logo 等同 URL 强制刷新：仅复位滚动，不卸列表（数据由 transitionTo 预热）
    const onFeedReset = () => {
      fetchSeqRef.current += 1;
      resetFeedView();
    };
    window.addEventListener(FEED_RESET_EVENT, onFeedReset);
    return () => window.removeEventListener(FEED_RESET_EVENT, onFeedReset);
  }, [resetFeedView]);

  useEffect(() => {
    // 下拉 / posts-refresh / 软刷新 commit：有预热则一次覆盖；禁止先卸列表
    const applyWarmOrReload = () => {
      fetchSeqRef.current += 1;
      const key = cacheKeyRef.current;
      const warm = getHomeStoreState().getFeed(key);
      if (warm && warm.posts.length > 0) {
        // 先写入新数据，再复位滚动（避免先 reset 造成空白闪一下）
        commitDisplayed({
          posts: warm.posts,
          postTotal: warm.postTotal,
          page: warm.page,
          scrollTop: 0,
          loading: false,
        }, { cacheKey: key, sort, boardId, keyword, tag, author, titleOnly });
        setListResetKey((k) => k + 1);
        return;
      }
      // 未命中：保留旧 posts，静默重拉
      if (postsRef.current.length > 0) {
        setListPending(true);
        setLoading(false);
        void loadFirst();
        return;
      }
      setLoading(true);
      void loadFirst();
    };
    window.addEventListener('posts-refresh', applyWarmOrReload);
    window.addEventListener(FEED_PULL_REFRESH_EVENT, applyWarmOrReload);
    window.addEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, applyWarmOrReload);
    return () => {
      window.removeEventListener('posts-refresh', applyWarmOrReload);
      window.removeEventListener(FEED_PULL_REFRESH_EVENT, applyWarmOrReload);
      window.removeEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, applyWarmOrReload);
    };
  }, [
    commitDisplayed, loadFirst,
    sort, boardId, keyword, tag, author, titleOnly,
  ]);

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
      getHomeStoreState().patchScroll(viewKeyRef.current, scrollTopRef.current);
    });
  }, []);

  const handleSortChange = (next: FeedSort) => {
    const url = buildHomeUrl(boardId, next, { keyword, tag, author, titleOnly, permalink: limits });
    // 排序标签：一律强制刷新到第 1 页顶部，不恢复浏览进度
    if (next === sort) {
      const tid = startTransition();
      getHomeStoreState().clearFeed(cacheKeyRef.current);
      beginFeedRefresh();
      void Promise.resolve(loadFirst({ resetScroll: true })).finally(() => doneTransition(tid));
      return;
    }
    navigateFeed(nav, url, { refresh: true });
  };

  const showSortBar = !view.keyword && !view.tag && !view.author;
  const searchFilters = parseSearchFromUrl(location.pathname, params);
  const isSearchActive = !!(view.keyword || view.author);

  if (isInvalidBoardRoute || isMissingBoard) {
    return (
      <NotFoundPage
        title="板块不存在"
        description="该板块不存在，或已被删除。"
      />
    );
  }

  // 冷启动由门闩 / ensureColdBootReady 挡住；有旧列表时软刷新绝不卸空
  if ((loading || limitsLoading || (isBoardRoute && boardsLoading)) && posts.length === 0) {
    return null;
  }

  return (
    <div className="page-wrap page-wrap--feed">
      <div className="feed-panel">
        <div className="feed-top">
          <div className="feed-top__bar">
            {!useVirtualList ? (
              (view.keyword || view.tag || view.author) ? (
                <h1 className="feed-header-title">
                  {view.tag
                    ? `#${view.tag}`
                    : view.keyword
                      ? `搜索：${view.keyword}`
                      : `作者：${view.author}`}
                </h1>
              ) : null
            ) : (
              <FeedHeader
                keyword={view.keyword}
                tag={view.tag}
                author={view.author}
                postTotal={postTotal}
                titleAs={isSiteHome ? 'h2' : 'h1'}
              />
            )}
            {showSortBar && (
              <FeedSortBar
                value={view.sort}
                pendingValue={listPending ? sort : null}
                onChange={handleSortChange}
                postTotal={postTotal}
              />
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
        {!useVirtualList ? (
          <StaticFeedList posts={posts} sort={view.sort} boardId={view.boardId} />
        ) : (
          <VirtualPostList
            posts={posts}
            sort={view.sort}
            loading={listPending ? false : (loading || limitsLoading)}
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
            keyword={view.keyword || view.tag || view.author}
            isSearchMode={!!(view.keyword || view.author)}
            searchKeyword={view.keyword}
            searchAuthor={view.author}
            searchTitleOnly={view.titleOnly}
            searchScopeBoardId={searchFilters.scopeBoardId}
            onClearSearch={postSearch.clearSearch}
            boardId={view.boardId}
            boardName={ctx?.boards?.find(b => b.id === view.boardId)?.name || ''}
            noBoards={!ctx?.boardsLoading && (ctx?.boards?.length ?? 0) === 0}
          />
        )}
      </div>
    </div>
  );
}
