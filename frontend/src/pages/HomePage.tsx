import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem } from '../api/types';
import type { LayoutCtx } from '../layouts/MainLayout';
import VirtualPostList from '../components/VirtualPostList';
import FeedHeader from '../components/FeedHeader';
import FeedSortBar, { parseFeedSort, buildHomeUrl, type FeedSort } from '../components/FeedSortBar';
import { getFeedCache, setFeedCache, clearAllFeedCache } from '../utils/feedCache';

export default function HomePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const ctx = useOutletContext<LayoutCtx>();
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
  const scrollTopRef = useRef(initialCache?.scrollTop ?? 0);

  const load = useCallback(async (p: number, reset = false) => {
    setLoading(true);
    try {
      const data = await api.posts({
        page: p,
        size: 30,
        board_id: boardId || '',
        keyword,
        sort: sort === 'latest' ? '' : sort,
      });
      const batch = Array.isArray(data.posts) ? data.posts : [];
      // 切换筛选时保留旧列表，避免中间区域瞬间空白
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
  }, [boardId, keyword, sort]);

  /** 有缓存时静默拉取已加载页，更新置顶等状态同时保留滚动位置 */
  const revalidate = useCallback(async (maxPage: number) => {
    try {
      const all: PostItem[] = [];
      let total = 0;
      let hasMore = true;
      for (let p = 1; p <= maxPage; p++) {
        const data = await api.posts({
          page: p,
          size: 30,
          board_id: boardId || '',
          keyword,
          sort: sort === 'latest' ? '' : sort,
        });
        const batch = Array.isArray(data.posts) ? data.posts : [];
        all.push(...batch);
        total = data.total ?? 0;
        hasMore = !!data.has_more;
        if (!data.has_more) break;
      }
      setPosts(all);
      setPostTotal(total);
      setHasMore(hasMore);
      setPage(maxPage);
    } catch {
      // 静默失败，保留缓存数据
    }
  }, [boardId, keyword, sort]);

  useEffect(() => {
    const cached = getFeedCache(boardId, keyword, sort);
    if (cached) {
      setPosts(cached.posts);
      setPostTotal(cached.postTotal);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      setRestoreScrollTop(cached.scrollTop);
      scrollTopRef.current = cached.scrollTop;
      setLoading(false);
      revalidate(cached.page);
      return;
    }
    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    load(1, true);
  }, [boardId, keyword, sort, load, revalidate]);

  useEffect(() => {
    return () => {
      if (posts.length === 0) return;
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
    const fn = () => {
      clearAllFeedCache();
      setRestoreScrollTop(null);
      scrollTopRef.current = 0;
      load(1, true);
    };
    window.addEventListener('posts-refresh', fn);
    return () => window.removeEventListener('posts-refresh', fn);
  }, [boardId, keyword, sort, load]);

  const handleSortChange = (next: FeedSort) => {
    if (next === sort) return;
    clearAllFeedCache();
    setRestoreScrollTop(null);
    scrollTopRef.current = 0;
    nav(buildHomeUrl(boardId, next));
  };

  const showSortBar = !keyword;

  return (
    <div className="page-wrap">
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
        onLoadMore={() => !loading && hasMore && load(page + 1)}
        onSelect={(id) => nav(`/post/${id}`)}
        restoreScrollTop={restoreScrollTop}
        onScrollTopChange={(top) => { scrollTopRef.current = top; }}
        onScrollRestored={() => setRestoreScrollTop(null)}
      />
    </div>
  );
}
