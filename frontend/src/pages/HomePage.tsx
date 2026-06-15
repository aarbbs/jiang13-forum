import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useOutletContext, useSearchParams, useLocation } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem } from '../api/types';
import type { LayoutCtx } from '../layouts/MainLayout';
import VirtualPostList from '../components/VirtualPostList';
import FeedHeader from '../components/FeedHeader';
import FeedSortBar, { parseFeedSort, buildHomeUrl, type FeedSort } from '../components/FeedSortBar';
import { useForumLimits } from '../hooks/useForumLimits';
import {
  getFeedCache,
  setFeedCache,
  clearAllFeedCache,
  navigateFeed,
  FEED_RESET_EVENT,
  type FeedNavState,
} from '../utils/feedCache';

export default function HomePage() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const ctx = useOutletContext<LayoutCtx>();
  const { limits } = useForumLimits();
  const pageSize = limits.page_size_default;
  const feedMaxPages = limits.feed_max_pages;
  const feedMaxItems = limits.feed_max_items;

  const boardId = Number(params.get('board')) || ctx?.boardId || 0;
  const keyword = params.get('keyword') || '';
  const sort = parseFeedSort(params.get('sort'));
  const initialCache = getFeedCache(boardId, keyword, sort);

  const [posts, setPosts] = useState<PostItem[]>(() => initialCache?.posts ?? []);
  const [postTotal, setPostTotal] = useState(() => initialCache?.postTotal ?? 0);
  const [page, setPage] = useState(() => initialCache?.page ?? 1);
  const [hasMore, setHasMore] = useState(() => initialCache?.hasMore ?? true);
  const [loading, setLoading] = useState(() => !initialCache);
  const [restoreScrollTop, setRestoreScrollTop] = useState<number | null>(() => initialCache?.scrollTop ?? null);
  const [listResetKey, setListResetKey] = useState(0);
  const scrollTopRef = useRef(initialCache?.scrollTop ?? 0);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  /** 主动刷新时不把旧列表/滚动位置写回 cache */
  const skipCacheSaveRef = useRef(false);

  const canAutoLoad = useMemo(
    () => hasMore && page < feedMaxPages && posts.length < feedMaxItems,
    [hasMore, page, feedMaxPages, posts.length, feedMaxItems],
  );

  const resetFeedView = useCallback(() => {
    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    setListResetKey(k => k + 1);
    pageWrapRef.current?.scrollTo(0);
  }, []);

  const beginFeedRefresh = useCallback(() => {
    skipCacheSaveRef.current = true;
    clearAllFeedCache();
    resetFeedView();
  }, [resetFeedView]);

  const load = useCallback(async (p: number, reset = false) => {
    setLoading(true);
    try {
      const data = await api.posts({
        page: p,
        size: pageSize,
        board_id: boardId || '',
        keyword,
        sort: sort === 'latest' ? '' : sort,
      });
      const batch = Array.isArray(data.posts) ? data.posts : [];
      setPosts(prev => (reset ? batch : [...prev, ...batch]));
      setPostTotal(data.total ?? 0);
      setHasMore(!!data.has_more);
      setPage(p);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
      if (reset) setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, keyword, sort, pageSize]);

  /** 有缓存时静默刷新第 1 页，合并置顶等变化同时保留已加载的历史 */
  const revalidate = useCallback(async () => {
    try {
      const data = await api.posts({
        page: 1,
        size: pageSize,
        board_id: boardId || '',
        keyword,
        sort: sort === 'latest' ? '' : sort,
      });
      const fresh = Array.isArray(data.posts) ? data.posts : [];
      const freshIds = new Set(fresh.map(p => p.id));
      setPosts(prev => [...fresh, ...prev.filter(p => !freshIds.has(p.id))]);
      setPostTotal(data.total ?? 0);
      setHasMore(!!data.has_more);
    } catch {
      // 静默失败，保留缓存数据
    }
  }, [boardId, keyword, sort, pageSize]);

  const loadNextPage = useCallback(() => {
    if (loading || !hasMore) return;
    load(page + 1);
  }, [loading, hasMore, page, load]);

  useEffect(() => {
    const forceRefresh = (location.state as FeedNavState | null)?.refreshFeed;
    if (forceRefresh) {
      beginFeedRefresh();
      load(1, true);
      return;
    }
    const cached = getFeedCache(boardId, keyword, sort);
    if (cached) {
      setPosts(cached.posts);
      setPostTotal(cached.postTotal);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      setRestoreScrollTop(cached.scrollTop);
      scrollTopRef.current = cached.scrollTop;
      setLoading(false);
      revalidate();
      return;
    }
    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    load(1, true);
  }, [boardId, keyword, sort, location.key, location.state, load, revalidate, beginFeedRefresh]);

  useEffect(() => {
    return () => {
      if (skipCacheSaveRef.current || posts.length === 0) return;
      setFeedCache(boardId, keyword, sort, {
        posts,
        postTotal,
        page,
        hasMore,
        scrollTop: scrollTopRef.current,
      });
    };
  }, [boardId, keyword, sort, posts, postTotal, page, hasMore]);

  useEffect(() => {
    if (!loading && posts.length > 0) {
      skipCacheSaveRef.current = false;
    }
  }, [loading, posts.length]);

  useEffect(() => {
    const onFeedReset = () => {
      beginFeedRefresh();
    };
    window.addEventListener(FEED_RESET_EVENT, onFeedReset);
    return () => window.removeEventListener(FEED_RESET_EVENT, onFeedReset);
  }, [beginFeedRefresh]);

  useEffect(() => {
    const fn = () => {
      beginFeedRefresh();
      load(1, true);
    };
    window.addEventListener('posts-refresh', fn);
    return () => window.removeEventListener('posts-refresh', fn);
  }, [beginFeedRefresh, load]);

  const handleSortChange = (next: FeedSort) => {
    if (next === sort) {
      beginFeedRefresh();
      load(1, true);
      return;
    }
    navigateFeed(nav, buildHomeUrl(boardId, next));
  };

  const showSortBar = !keyword;

  return (
    <div className="page-wrap" ref={pageWrapRef}>
      <div className="feed-top">
        <FeedHeader
          boardId={boardId}
          keyword={keyword}
          boards={ctx?.boards ?? []}
          stats={ctx?.stats ?? null}
          postTotal={postTotal}
        />
        {showSortBar && (
          <FeedSortBar value={sort} onChange={handleSortChange} postTotal={postTotal} />
        )}
      </div>
      <VirtualPostList
        posts={posts}
        sort={sort}
        loading={loading}
        hasMore={hasMore}
        canAutoLoad={canAutoLoad}
        postTotal={postTotal}
        onLoadMore={loadNextPage}
        onSelect={(id) => nav(`/post/${id}`)}
        restoreScrollTop={restoreScrollTop}
        resetScrollKey={listResetKey}
        onScrollTopChange={(top) => { scrollTopRef.current = top; }}
        onScrollRestored={() => setRestoreScrollTop(null)}
      />
    </div>
  );
}
