import { useRef, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostListItem from './PostListItem';
import PostListSkeleton from './PostListSkeleton';
import FeedPagination from './FeedPagination';
import { useAuth } from '../hooks/useAuth';
import { loginPath } from '../utils/authRedirect';
import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';

interface Props {
  posts: PostItem[];
  sort?: FeedSort;
  loading: boolean;
  /** 当前页之后是否还有更多 */
  hasMore: boolean;
  /** 是否显示底部分页控件 */
  showPagination: boolean;
  page: number;
  totalPages: number;
  postTotal: number;
  onPageChange: (page: number) => void;
  onSelect: (id: number) => void;
  restoreScrollTop?: number | null;
  resetScrollKey?: number;
  onScrollTopChange?: (top: number) => void;
  onScrollRestored?: () => void;
}

export default function VirtualPostList({
  posts,
  sort = 'latest',
  loading,
  hasMore,
  showPagination,
  page,
  totalPages,
  postTotal,
  onPageChange,
  onSelect,
  restoreScrollTop,
  resetScrollKey = 0,
  onScrollTopChange,
  onScrollRestored,
}: Props) {
  const nav = useNavigate();
  const { user } = useAuth();
  const parentRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const onScrollTopChangeRef = useRef(onScrollTopChange);
  const onScrollRestoredRef = useRef(onScrollRestored);
  onScrollTopChangeRef.current = onScrollTopChange;
  onScrollRestoredRef.current = onScrollRestored;

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

  const showEnd = !hasMore && !showPagination && posts.length > 0 && !loading;
  const isInitialLoad = loading && posts.length === 0;
  const isEmpty = !loading && posts.length === 0;

  useLayoutEffect(() => {
    if (resetScrollKey <= 0) return;
    const el = parentRef.current;
    if (el) {
      el.scrollTop = 0;
      virtualizer.scrollToOffset(0);
    }
    restoredRef.current = true;
    onScrollTopChangeRef.current?.(0);
  }, [resetScrollKey, virtualizer]);

  useLayoutEffect(() => {
    if (restoreScrollTop == null || restoredRef.current || posts.length === 0) return;
    virtualizer.scrollToOffset(restoreScrollTop);
    restoredRef.current = true;
    onScrollRestoredRef.current?.();
  }, [restoreScrollTop, posts.length, virtualizer]);

  useEffect(() => {
    restoredRef.current = false;
  }, [restoreScrollTop]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      onScrollTopChangeRef.current?.(el.scrollTop);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="post-list-scroll" ref={parentRef}>
      {isInitialLoad ? (
        <PostListSkeleton />
      ) : isEmpty ? (
        <div className="empty-feed" role="status">
          <Inbox className="empty-feed-icon" aria-hidden size={36} strokeWidth={1.5} />
          <p>暂无帖子</p>
          <p className="empty-feed-hint">换个板块看看，或发第一篇内容</p>
          <div className="empty-feed-actions">
            {user ? (
              <Button type="button" size="sm" onClick={() => nav('/compose')}>
                发第一帖
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => nav(loginPath('/compose'))}>
                登录后发帖
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="content-surface" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vi => {
              const post = posts[vi.index];
              if (!post) return null;
              return (
                <div
                  key={vi.key}
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
                  <PostListItem post={post} sort={sort} onSelect={onSelect} />
                </div>
              );
            })}
          </div>
          {showPagination && (
            <div className="feed-list-footer feed-list-footer--pagination">
              <FeedPagination
                page={page}
                totalPages={totalPages}
                postTotal={postTotal}
                loading={loading}
                onPageChange={onPageChange}
              />
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
