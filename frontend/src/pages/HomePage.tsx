import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem } from '../api/types';
import type { LayoutCtx } from '../layouts/MainLayout';
import VirtualPostList from '../components/VirtualPostList';
import FeedHeader from '../components/FeedHeader';
import BoardGrid from '../components/BoardGrid';

export default function HomePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const ctx = useOutletContext<LayoutCtx>();
  const boardId = Number(params.get('board')) || ctx?.boardId || 0;
  const keyword = params.get('keyword') || '';

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postTotal, setPostTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, reset = false) => {
    setLoading(true);
    try {
      const data = await api.posts({ page: p, size: 30, board_id: boardId || '', keyword });
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
  }, [boardId, keyword]);

  useEffect(() => {
    load(1, true);
  }, [boardId, keyword, load]);

  useEffect(() => {
    const fn = () => load(1, true);
    window.addEventListener('posts-refresh', fn);
    return () => window.removeEventListener('posts-refresh', fn);
  }, [load]);

  const showBoardGrid = !keyword;

  return (
    <div className="page-wrap">
      <FeedHeader
        boardId={boardId}
        keyword={keyword}
        boards={ctx?.boards ?? []}
        stats={ctx?.stats ?? null}
        postTotal={postTotal}
      />
      {showBoardGrid && (
        <BoardGrid
          boards={ctx?.boards ?? []}
          loading={!ctx?.layoutReady}
          selectedId={boardId}
          onSelect={(id) => {
            ctx?.setBoardId(id);
            nav(id ? `/?board=${id}` : '/');
          }}
        />
      )}
      <div className="post-list-bar">
        <span>{keyword ? '搜索结果' : '帖子列表'}</span>
        <span>共 {postTotal} 条</span>
      </div>
      <VirtualPostList
        posts={posts}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={() => !loading && hasMore && load(page + 1)}
        onSelect={(id) => nav(`/post/${id}`)}
      />
    </div>
  );
}
