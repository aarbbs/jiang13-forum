import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Spinner } from '@/components/ui/spinner';
import PostListItem from './PostListItem';
import type { PostItem } from '../api/types';

interface Props {
  posts: PostItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (id: number) => void;
}

export default function VirtualPostList({ posts, loading, hasMore, onLoadMore, onSelect }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120 && hasMore && !loading) {
        onLoadMore();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore, loading, onLoadMore]);

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
              <PostListItem post={post} onClick={() => onSelect(post.id)} />
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
