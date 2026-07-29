import { useRef, useEffect, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostListItem from './PostListItem';
import PostListSkeleton from './PostListSkeleton';
import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';

interface Props {
  posts: PostItem[];
  sort?: FeedSort;
  loading: boolean;
  hasMore: boolean;
  /** 是否允许滚动触底自动加载（达到上限后为 false） */
  canAutoLoad: boolean;
  postTotal: number;
  onLoadMore: () => void;
  onSelect: (id: number) => void;
  /** 返回列表时恢复的滚动位置 */
  restoreScrollTop?: number | null;
  /** 递增时强制回到列表顶部（主动刷新导航） */
  resetScrollKey?: number;
  onScrollTopChange?: (top: number) => void;
  onScrollRestored?: () => void;
}

export default function VirtualPostList({
  posts,
  sort = 'latest',
  loading,
  hasMore,
  canAutoLoad,
  postTotal,
  onLoadMore,
  onSelect,
  restoreScrollTop,
  resetScrollKey = 0,
  onScrollTopChange,
  onScrollRestored,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8,
    measureElement:
      typeof window !== 'undefined' && !navigator.userAgent.includes('Firefox')
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  const showHistoryPrompt = hasMore && !canAutoLoad && !loading;
  const showEnd = !hasMore && posts.length > 0 && !loading;
  const isInitialLoad = loading && posts.length === 0;
  const isLoadingMore = loading && posts.length > 0;
  const isEmpty = !loading && posts.length === 0;

  useLayoutEffect(() => {
    if (resetScrollKey <= 0) return;
    const el = parentRef.current;
    if (el) {
      el.scrollTop = 0;
      virtualizer.scrollToOffset(0);
    }
    restoredRef.current = true;
    onScrollTopChange?.(0);
  }, [resetScrollKey, virtualizer, onScrollTopChange]);

  useLayoutEffect(() => {
    if (restoreScrollTop == null || restoredRef.current || posts.length === 0) return;
    virtualizer.scrollToOffset(restoreScrollTop);
    restoredRef.current = true;
    onScrollRestored?.();
  }, [restoreScrollTop, posts.length, virtualizer, onScrollRestored]);

  useEffect(() => {
    restoredRef.current = false;
  }, [restoreScrollTop]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      onScrollTopChange?.(el.scrollTop);
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120 && canAutoLoad && hasMore && !loading) {
        onLoadMore();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [canAutoLoad, hasMore, loading, onLoadMore, onScrollTopChange]);

  return (
    <div className="post-list-scroll" ref={parentRef}>
      {isInitialLoad ? (
        <PostListSkeleton />
      ) : isEmpty ? (
        <div className="empty-feed">
          <Inbox className="empty-feed-icon" aria-hidden size={36} strokeWidth={1.5} />
          <p>暂无帖子</p>
          <p className="empty-feed-hint">换个板块看看，或发第一篇内容</p>
        </div>
      ) : (
        <>
          <div className="content-surface" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vi => {
              const post = posts[vi.index];
              return (
                <div
                  key={post.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <PostListItem post={post} sort={sort} onClick={() => onSelect(post.id)} />
                </div>
              );
            })}
          </div>
          {isLoadingMore && <PostListSkeleton count={2} />}
          {showHistoryPrompt && (
            <div className="feed-list-footer feed-list-footer--history">
              <p className="feed-list-footer__hint">
                已显示 {posts.length} / {postTotal} 条
              </p>
              <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>
                加载更多历史
              </Button>
            </div>
          )}
          {showEnd && (
            <div className="feed-list-footer feed-list-footer--end">— 已加载全部 —</div>
          )}
        </>
      )}
    </div>
  );
}
