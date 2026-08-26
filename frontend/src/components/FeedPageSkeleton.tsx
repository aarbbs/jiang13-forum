import { Skeleton } from '@/components/ui/skeleton';
import PostListSkeleton from './PostListSkeleton';
import { useForumLimits } from '../hooks/useForumLimits';

/** 首页 Feed 初始骨架（标题区 + 排序栏 + 列表） */
export default function FeedPageSkeleton() {
  const { limits } = useForumLimits();

  return (
    <div className="page-wrap page-wrap--feed" aria-busy="true" aria-label="内容加载中">
      <div className="feed-panel">
        <div className="feed-top">
          <div className="feed-top__bar">
            <div className="feed-head feed-head--stats-only">
              <div className="feed-head__title">
                <div className="feed-head__stats">
                  <Skeleton className="skeleton--stat-chip" />
                  <Skeleton className="skeleton--stat-chip" />
                  <Skeleton className="skeleton--stat-chip" />
                </div>
              </div>
            </div>
            <div className="feed-toolbar feed-toolbar--skeleton" aria-hidden>
              <Skeleton className="skeleton--sort-tab" />
              <Skeleton className="skeleton--sort-tab" />
              <Skeleton className="skeleton--sort-tab" />
              <span className="feed-toolbar__spacer" />
              <Skeleton className="skeleton--count" />
            </div>
          </div>
        </div>
        <div className="post-list-scroll">
          <PostListSkeleton listStyle={limits.feed_list_style ?? 'title'} />
        </div>
      </div>
    </div>
  );
}
