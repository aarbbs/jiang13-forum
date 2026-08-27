import { Skeleton } from '@/components/ui/skeleton';
import type { ForumLimitsPublic } from '../api/types';

export type FeedListStyle = ForumLimitsPublic['feed_list_style'];

/** 虚拟列表行高预估值 */
export function feedListRowEstimate(style: FeedListStyle): number {
  switch (style) {
    case 'excerpt': return 68;
    case 'thumbnail': return 72;
    default: return 64;
  }
}

interface Props {
  count?: number;
  listStyle?: FeedListStyle;
}

/** 帖子列表加载骨架屏（对齐 v2 紧凑列表） */
export default function PostListSkeleton({ count = 8, listStyle = 'title' }: Props) {
  const showExcerpt = listStyle === 'excerpt' || listStyle === 'thumbnail';
  const showThumb = listStyle === 'thumbnail';
  const titleOnly = listStyle === 'title';

  return (
    <div className="post-list-skeleton" aria-busy="true" aria-label="加载中">
      {Array.from({ length: count }, (_, i) => {
        const hasThumb = showThumb && i % 3 === 0;
        return (
          <div
            key={i}
            className={`post-row post-row--v2 post-row--skeleton${titleOnly ? ' post-row--title-only' : ''}${hasThumb ? ' post-row--has-thumb' : ''}`}
          >
            <Skeleton className="skeleton--avatar skeleton--avatar-v2" />
            {hasThumb ? (
              <div className="post-main post-main--with-thumb">
                <div className="post-content">
                  <Skeleton className="skeleton--title skeleton--title-v2" style={{ width: `${58 + (i % 4) * 9}%` }} />
                  {showExcerpt && (
                    <Skeleton className="skeleton--excerpt skeleton--excerpt-v2" style={{ width: `${72 + (i % 3) * 8}%` }} />
                  )}
                  <div className="post-meta-left post-meta-left--skeleton">
                    <Skeleton className="skeleton--board-badge" />
                    <Skeleton className="skeleton--meta-line" style={{ width: `${45 + (i % 3) * 10}%` }} />
                  </div>
                </div>
                <div className="post-aside">
                  <Skeleton className="skeleton--thumb skeleton--thumb-tall" />
                  <div className="post-stats">
                    <Skeleton className="skeleton--stat" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="post-main">
                <div className="post-text">
                  <Skeleton className="skeleton--title skeleton--title-v2" style={{ width: `${58 + (i % 4) * 9}%` }} />
                  {showExcerpt && (
                    <Skeleton className="skeleton--excerpt skeleton--excerpt-v2" style={{ width: `${72 + (i % 3) * 8}%` }} />
                  )}
                </div>
                <div className="post-meta">
                  <div className="post-meta-left post-meta-left--skeleton">
                    <Skeleton className="skeleton--board-badge" />
                    <Skeleton className="skeleton--meta-line" style={{ width: `${45 + (i % 3) * 10}%` }} />
                  </div>
                  <div className="post-stats">
                    <Skeleton className="skeleton--stat" />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
