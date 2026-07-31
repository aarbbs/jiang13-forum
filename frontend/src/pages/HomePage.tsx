import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useOutletContext, useSearchParams, useLocation } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem } from '../api/types';
import type { LayoutCtx } from '../layouts/MainLayout';
import VirtualPostList from '../components/VirtualPostList';
import FeedHeader from '../components/FeedHeader';
import FeedPageSkeleton from '../components/FeedPageSkeleton';
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
import { openForumPost } from '../utils/openPost';

export default function HomePage() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const ctx = useOutletContext<LayoutCtx>();
  const { limits, loading: limitsLoading } = useForumLimits();
  const pageSize = Math.max(1, limits.page_size_default);

  const boardId = Number(params.get('board')) || ctx?.boardId || 0;
  const keyword = params.get('keyword') || '';
  const sort = parseFeedSort(params.get('sort'));

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postTotal, setPostTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [restoreScrollTop, setRestoreScrollTop] = useState<number | null>(null);
  const [listResetKey, setListResetKey] = useState(0);

  const scrollTopRef = useRef(0);
  const skipCacheSaveRef = useRef(false);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  pageRef.current = page;

  const totalPages = Math.max(1, Math.ceil(Math.max(postTotal, 0) / pageSize));
  const showPagination = totalPages > 1 && posts.length > 0;
  const hasMore = page < totalPages;

  const resetFeedView = useCallback(() => {
    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    setListResetKey(k => k + 1);
  }, []);

  const beginFeedRefresh = useCallback(() => {
    skipCacheSaveRef.current = true;
    clearAllFeedCache();
    resetFeedView();
  }, [resetFeedView]);

  const fetchPage = useCallback(async (p: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
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
      const total = data.total ?? 0;
      setPosts(batch);
      setPostTotal(total);
      setPage(p);
      pageRef.current = p;
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
      setPosts([]);
      setPostTotal(0);
      setPage(1);
      pageRef.current = 1;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [boardId, keyword, sort, pageSize]);

  const loadFirst = useCallback(() => fetchPage(1), [fetchPage]);

  const goToPage = useCallback((p: number) => {
    if (loadingRef.current) return;
    const maxPage = Math.max(1, Math.ceil(Math.max(postTotal, 0) / pageSize));
    if (p < 1 || p > maxPage) return;
    if (p === pageRef.current) return;
    resetFeedView();
    fetchPage(p);
  }, [fetchPage, postTotal, pageSize, resetFeedView]);

  const handleSelectPost = useCallback((id: number) => {
    openForumPost(nav, id, limits.open_posts_in_new_tab);
  }, [nav, limits.open_posts_in_new_tab]);

  // 等限制就绪后再拉列表；筛选变化时重载
  useEffect(() => {
    if (limitsLoading) return;

    const forceRefresh = (location.state as FeedNavState | null)?.refreshFeed;
    if (forceRefresh) {
      beginFeedRefresh();
      loadFirst();
      return;
    }

    const cached = getFeedCache(boardId, keyword, sort);
    if (cached && cached.posts.length > 0) {
      setPosts(cached.posts);
      setPostTotal(cached.postTotal);
      setPage(cached.page);
      pageRef.current = cached.page;
      setRestoreScrollTop(cached.scrollTop);
      scrollTopRef.current = cached.scrollTop;
      setLoading(false);
      return;
    }

    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    loadFirst();
  }, [
    limitsLoading,
    pageSize,
    boardId,
    keyword,
    sort,
    location.key,
    location.state,
    loadFirst,
    beginFeedRefresh,
  ]);

  // 离开当前筛选条件时写入内存缓存
  useEffect(() => {
    return () => {
      if (skipCacheSaveRef.current || posts.length === 0) return;
      setFeedCache(boardId, keyword, sort, {
        posts,
        postTotal,
        page,
        scrollTop: scrollTopRef.current,
      });
    };
  }, [boardId, keyword, sort, posts, postTotal, page]);

  useEffect(() => {
    if (!loading && posts.length > 0) skipCacheSaveRef.current = false;
  }, [loading, posts.length]);

  useEffect(() => {
    const onFeedReset = () => beginFeedRefresh();
    window.addEventListener(FEED_RESET_EVENT, onFeedReset);
    return () => window.removeEventListener(FEED_RESET_EVENT, onFeedReset);
  }, [beginFeedRefresh]);

  useEffect(() => {
    const fn = () => {
      beginFeedRefresh();
      loadFirst();
    };
    window.addEventListener('posts-refresh', fn);
    return () => window.removeEventListener('posts-refresh', fn);
  }, [beginFeedRefresh, loadFirst]);

  const handleSortChange = (next: FeedSort) => {
    if (next === sort) {
      beginFeedRefresh();
      loadFirst();
      return;
    }
    navigateFeed(nav, buildHomeUrl(boardId, next));
  };

  const showSortBar = !keyword;

  // 首屏用同构骨架，避免标题/列表分区先后出现造成闪动
  if ((loading || limitsLoading) && posts.length === 0) {
    return <FeedPageSkeleton />;
  }

  return (
    <div className="page-wrap page-wrap--feed">
      <div className="feed-panel">
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
          onScrollTopChange={(top) => { scrollTopRef.current = top; }}
          onScrollRestored={() => setRestoreScrollTop(null)}
        />
      </div>
    </div>
  );
}
