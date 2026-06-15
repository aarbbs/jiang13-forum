import { useRef, useEffect, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Spinner } from '@/components/ui/spinner';
import PostListItem from './PostListItem';
import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';

interface Props {
  posts: PostItem[];
  sort?: FeedSort;
  loading: boolean;
  hasMore: boolean;
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
  });

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
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120 && hasMore && !loading) {
        onLoadMore();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, loading, onLoadMore, onScrollTopChange]);

  return (
    <div className="post-list-scroll" ref={parentRef}>
      <div className="content-surface" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vi => {
          const post = posts[vi.index];
          return (
            <div
              key={post.id}
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
      {loading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {!loading && !hasMore && posts.length > 0 && (
        <div style={{ textAlign: 'center', padding: 6, fontSize: 12, color: 'var(--color-text-3)' }}>— 已加载全部 —</div>
      )}
    </div>
  );
}
