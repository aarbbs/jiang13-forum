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
import { joinSEOKeywords, usePageSEO } from '../hooks/usePageSEO';
import { siteMetaDescription, useSiteBranding } from '../hooks/useSiteBranding';

export default function HomePage() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const ctx = useOutletContext<LayoutCtx>();
  const { branding } = useSiteBranding();
  const { limits, loading: limitsLoading } = useForumLimits();
  const pageSize = Math.max(1, limits.page_size_default);

  const boardId = Number(params.get('board')) || ctx?.boardId || 0;
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
      ? `搜索：${keyword || ''}${author ? (keyword ? ` · 作者 ${author}` : `作者 ${author}`) : ''}${titleOnly ? '（仅标题）' : ''}`
      : (boardId && board ? board.name : '');
  usePageSEO({
    title: feedTitle || undefined,
    description: board?.description?.trim() || siteIntro,
    keywords: joinSEOKeywords(board?.name, tag, branding.keywords),
    canonicalPath: tag
      ? `/?tag=${encodeURIComponent(tag)}`
      : boardId
        ? `/?board=${boardId}`
        : '/',
    ogType: 'website',
  });

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
  // 与当前筛选一致的列表快照（供卸载/切换筛选时写入缓存）
  const feedSnapRef = useRef({ boardId, keyword, tag, author, titleOnly, sort, posts, postTotal, page });

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
        keyword: tag ? '' : keyword,
        tag: tag || '',
        author: tag ? '' : author,
        title_only: !tag && titleOnly ? '1' : '',
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
  }, [boardId, keyword, tag, author, titleOnly, sort, pageSize]);

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

    const cached = getFeedCache(boardId, keyword, sort, tag, author, titleOnly);
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
    tag,
    author,
    titleOnly,
    sort,
    location.key,
    location.state,
    loadFirst,
    beginFeedRefresh,
  ]);

  // 筛选未变时同步列表快照；变筛选的那一帧先保留旧快照供 cleanup 写入
  if (
    feedSnapRef.current.boardId === boardId
    && feedSnapRef.current.keyword === keyword
    && feedSnapRef.current.tag === tag
    && feedSnapRef.current.author === author
    && feedSnapRef.current.titleOnly === titleOnly
    && feedSnapRef.current.sort === sort
  ) {
    feedSnapRef.current = { boardId, keyword, tag, author, titleOnly, sort, posts, postTotal, page };
  }

  // 仅在筛选变化 / 卸载时缓存；勿把 posts 放进 deps（否则会用旧列表污染新 keyword）
  useEffect(() => {
    // cleanup 先保存上一档；再把快照重置为当前筛选的空占位
    feedSnapRef.current = { boardId, keyword, tag, author, titleOnly, sort, posts: [], postTotal: 0, page: 1 };
    return () => {
      if (skipCacheSaveRef.current) return;
      const snap = feedSnapRef.current;
      if (snap.posts.length === 0) return;
      setFeedCache(snap.boardId, snap.keyword, snap.sort, {
        posts: snap.posts,
        postTotal: snap.postTotal,
        page: snap.page,
        scrollTop: scrollTopRef.current,
      }, snap.tag, snap.author, snap.titleOnly);
    };
  }, [boardId, keyword, tag, author, titleOnly, sort]);

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
    navigateFeed(nav, buildHomeUrl(boardId, next, { keyword, tag, author, titleOnly }));
  };

  const showSortBar = !keyword && !tag && !author;

  // 首屏用同构骨架，避免标题/列表分区先后出现造成闪动
  if ((loading || limitsLoading) && posts.length === 0) {
    return <FeedPageSkeleton />;
  }

  return (
    <div className="page-wrap page-wrap--feed">
      <div className="feed-panel">
        <div className="feed-top">
          <div className="feed-top__bar">
            <FeedHeader
              boardId={boardId}
              keyword={keyword}
              tag={tag}
              author={author}
              titleOnly={titleOnly}
              boards={ctx?.boards ?? []}
              stats={ctx?.stats ?? null}
              postTotal={postTotal}
              titleAs={isSiteHome ? 'h2' : 'h1'}
            />
            {showSortBar && (
              <FeedSortBar value={sort} onChange={handleSortChange} postTotal={postTotal} />
            )}
          </div>
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
          keyword={keyword || tag || author}
          boardId={boardId}
          boardName={ctx?.boards?.find(b => b.id === boardId)?.name || ''}
          noBoards={!ctx?.boardsLoading && (ctx?.boards?.length ?? 0) === 0}
        />
      </div>
    </div>
  );
}
