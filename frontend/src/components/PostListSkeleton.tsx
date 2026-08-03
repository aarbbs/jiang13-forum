import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  count?: number;
}

/** 帖子列表加载骨架屏（对齐卡片式列表） */
export default function PostListSkeleton({ count = 8 }: Props) {
  return (
    <div className="post-list-skeleton" aria-busy="true" aria-label="加载中">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="post-row post-row--skeleton">
          <Skeleton className="skeleton--avatar" />
          <div className="post-body">
            <div className="post-head">
              <div className="skeleton-meta-row">
                <Skeleton className="skeleton--meta" />
                <Skeleton className="skeleton--meta skeleton--meta-short" />
              </div>
              {i % 4 === 0 && <Skeleton className="skeleton--badge" />}
            </div>
            <Skeleton className="skeleton--title" style={{ width: `${58 + (i % 4) * 9}%` }} />
            <Skeleton className="skeleton--excerpt" style={{ width: `${72 + (i % 3) * 8}%` }} />
            <div className="post-foot">
              <Skeleton className="skeleton--badge" />
              <div className="post-stats">
                <Skeleton className="skeleton--stat" />
                <Skeleton className="skeleton--stat" />
                <Skeleton className="skeleton--stat" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
