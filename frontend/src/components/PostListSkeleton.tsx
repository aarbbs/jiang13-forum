import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  count?: number;
}

/** 帖子列表加载骨架屏 */
export default function PostListSkeleton({ count = 8 }: Props) {
  return (
    <div className="post-list-skeleton" aria-busy="true" aria-label="加载中">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="post-row post-row--skeleton">
          <Skeleton className="skeleton--avatar" />
          <div className="post-body">
            <Skeleton className="skeleton--title" style={{ width: `${55 + (i % 4) * 10}%` }} />
            <div className="skeleton-meta-row">
              <Skeleton className="skeleton--badge" />
              <Skeleton className="skeleton--meta" />
              <Skeleton className="skeleton--meta skeleton--meta-short" />
            </div>
          </div>
          <div className="post-stats">
            <Skeleton className="skeleton--stat" />
            <Skeleton className="skeleton--stat" />
          </div>
        </div>
      ))}
    </div>
  );
}
