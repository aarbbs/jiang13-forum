import { Flame, MessageCircle, Tags } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import type { PostItem, RecentComment, TagCount } from '../api/types';
import { useSiteBranding } from '../hooks/useSiteBranding';
import TagCloud from './TagCloud';

interface Props {
  hot: PostItem[];
  recentComments: RecentComment[];
  tags?: TagCount[];
  tagsLoading?: boolean;
  onPostClick: (id: number) => void;
  /** 首次拉取中，显示骨架避免空态闪烁 */
  loading?: boolean;
}

function hotRankClass(index: number): string {
  if (index === 0) return 'widget-rank widget-rank--1';
  if (index === 1) return 'widget-rank widget-rank--2';
  if (index === 2) return 'widget-rank widget-rank--3';
  return 'widget-rank';
}

function HotSkeleton() {
  return (
    <div className="widget-skeleton" aria-busy="true" aria-label="热门加载中">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="widget-item widget-item--skeleton">
          <Skeleton className="skeleton--widget-rank" />
          <Skeleton className="skeleton--widget-title" style={{ width: `${62 + (i % 4) * 8}%` }} />
        </div>
      ))}
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="widget-skeleton" aria-busy="true" aria-label="评论加载中">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="widget-item widget-item--comment widget-item--skeleton">
          <Skeleton className="skeleton--widget-avatar" />
          <Skeleton className="skeleton--widget-title" style={{ width: `${55 + (i % 3) * 12}%` }} />
          <Skeleton className="skeleton--widget-time" />
        </div>
      ))}
    </div>
  );
}

export default function RightPanel({
  hot,
  recentComments,
  tags = [],
  tagsLoading = false,
  onPostClick,
  loading = false,
}: Props) {
  const { branding } = useSiteBranding();
  const [params] = useSearchParams();
  const activeTag = params.get('keyword') || '';
  const hotList = hot?.slice(0, 8) ?? [];
  const commentList = recentComments?.slice(0, 6) ?? [];

  return (
    <div className="aside-panel-inner">
      <div className="widget-card">
        <div className="widget-card-head">
          <Flame className="widget-card-icon widget-card-icon--hot" aria-hidden />
          热门帖子
        </div>
        <div className="widget-card-body">
          {loading && hotList.length === 0 ? (
            <HotSkeleton />
          ) : hotList.length === 0 ? (
            <div className="widget-empty">暂无数据</div>
          ) : hotList.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className="widget-item"
              onClick={() => onPostClick(item.id)}
            >
              <span className={hotRankClass(i)}>{i + 1}</span>
              <span className="widget-item-title">{item.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="widget-card widget-card--tags">
        <div className="widget-card-head">
          <Tags className="widget-card-icon widget-card-icon--tags" aria-hidden />
          标签云
        </div>
        <div className="widget-card-body widget-card-body--tags">
          <TagCloud tags={tags} loading={tagsLoading} activeTag={activeTag} />
        </div>
      </div>

      <div className="widget-card">
        <div className="widget-card-head">
          <MessageCircle className="widget-card-icon widget-card-icon--notice" aria-hidden />
          最新评论
        </div>
        <div className="widget-card-body">
          {loading && commentList.length === 0 ? (
            <CommentSkeleton />
          ) : commentList.length === 0 ? (
            <div className="widget-empty">暂无评论</div>
          ) : commentList.map(item => (
            <button
              key={item.id}
              type="button"
              className="widget-item widget-item--comment"
              title={item.post_title ? `${item.author} · ${item.post_title}` : item.author}
              onClick={() => onPostClick(item.post_id)}
            >
              <span className="widget-item-avatar" aria-hidden>
                {item.avatar
                  ? <img src={item.avatar} alt="" loading="lazy" decoding="async" />
                  : (item.author?.[0] || '?')}
              </span>
              <span className="widget-item-title">{item.excerpt}</span>
              <span className="widget-item-time">{item.created_at}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="widget-card widget-card--about">
        <div className="widget-card-body">
          <p className="widget-about-text">
            <strong>{branding.name}</strong>
            {branding.slogan
              ? `${branding.slogan}${branding.name_en ? ` · ${branding.name_en}` : ''}`
              : (branding.name_en || '轻量社区')}
          </p>
        </div>
      </div>
    </div>
  );
}
