import { Flame, ListTree, MessageCircle, Tags, Sparkles } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import type { PostItem, RecentComment, TagCount, User } from '../api/types';
import type { PostHeading } from '../utils/postHeadings';
import { useSiteBranding } from '../hooks/useSiteBranding';
import TagCloud from './TagCloud';
import UserLink from './UserLink';
import ArticleOutline from './ArticleOutline';
import PostAuthorCard from './PostAuthorCard';

export type PostDetailAside = {
  author?: User | null;
  publishedAt?: string;
  viewCount?: number;
  headings: PostHeading[];
  scrollRoot?: HTMLElement | null;
  outlineTitle?: string;
};

interface Props {
  hot: PostItem[];
  recentComments: RecentComment[];
  tags?: TagCount[];
  tagsLoading?: boolean;
  onPostClick: (id: number, opts?: { floor?: number }) => void;
  /** 首次拉取中，显示骨架避免空态闪烁 */
  loading?: boolean;
  /** 帖子详情：右侧顶部展示作者与目录 */
  postDetail?: PostDetailAside | null;
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
  postDetail = null,
}: Props) {
  const { branding } = useSiteBranding();
  const loc = useLocation();
  const [params] = useSearchParams();
  const activeTag = params.get('keyword') || '';
  const hotList = hot?.slice(0, 8) ?? [];
  const commentList = recentComments?.slice(0, 6) ?? [];
  // 站点首页：右侧品牌块承担唯一 h1；板块/搜索等页面由 Feed 标题作 h1
  const isSiteHome = loc.pathname === '/' && !params.get('board') && !params.get('keyword');
  const description = branding.description?.trim() || '';
  const slogan = branding.slogan?.trim() || '';
  // 有独立简介时展示简介；否则用欢迎语，避免与页脚 slogan 三连重复
  const aboutText = description || '欢迎参与讨论，发帖、评论，一起把小圈子聊热。';
  // 帖子很少时热门几乎等于主列表，改显示欢迎引导
  const showHot = loading || hotList.length >= 4;
  const showWelcome = !loading && hotList.length > 0 && hotList.length < 4;
  const isPostDetail = !!postDetail;

  return (
    <div className={`aside-panel-inner${isPostDetail ? ' aside-panel-inner--post-detail' : ''}`}>
      {isPostDetail && (
        <>
          <PostAuthorCard
            author={postDetail.author}
            publishedAt={postDetail.publishedAt}
            viewCount={postDetail.viewCount}
          />
          <div className="widget-card widget-card--outline">
            <div className="widget-card-head">
              <ListTree className="widget-card-icon widget-card-icon--outline" aria-hidden />
              {postDetail.outlineTitle || '文章目录'}
            </div>
            <div className="widget-card-body widget-outline-body">
              <ArticleOutline
                headings={postDetail.headings}
                scrollRoot={postDetail.scrollRoot}
                title={postDetail.outlineTitle || '文章目录'}
                className="article-outline--aside"
              />
            </div>
          </div>
        </>
      )}

      {!isPostDetail && showWelcome && (
        <div className="widget-card widget-card--welcome">
          <div className="widget-card-head">
            <Sparkles className="widget-card-icon widget-card-icon--welcome" aria-hidden />
            加入讨论
          </div>
          <div className="widget-card-body widget-welcome-body">
            <p>社区还在起步，每条回复都很珍贵。</p>
            <ul>
              <li>逛逛板块，找到感兴趣的话题</li>
              <li>游客也能评论，登录可点赞收藏</li>
              <li>发一篇帖，留下你的痕迹</li>
            </ul>
          </div>
        </div>
      )}

      {!isPostDetail && showHot && (
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
      )}

      {!isPostDetail && (
        <div className="widget-card widget-card--tags">
          <div className="widget-card-head">
            <Tags className="widget-card-icon widget-card-icon--tags" aria-hidden />
            标签云
          </div>
          <div className="widget-card-body widget-card-body--tags">
            <TagCloud tags={tags} loading={tagsLoading} activeTag={activeTag} />
          </div>
        </div>
      )}

      {!isPostDetail && (
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
              <div
                key={item.id}
                className="widget-item widget-item--comment"
                title={item.post_title ? `${item.author} · ${item.post_title}` : item.author}
              >
                {item.user_id ? (
                  <UserLink
                    user={{ id: item.user_id, nickname: item.author, avatar: item.avatar }}
                    showAvatar={false}
                    showName={false}
                    stopPropagation
                    className="widget-item-avatar user-link--avatar-only"
                  >
                    {item.avatar
                      ? <img src={item.avatar} alt="" loading="lazy" decoding="async" />
                      : (item.author?.[0] || '?')}
                  </UserLink>
                ) : (
                  <span className="widget-item-avatar" aria-hidden>
                    {item.avatar
                      ? <img src={item.avatar} alt="" loading="lazy" decoding="async" />
                      : (item.author?.[0] || '?')}
                  </span>
                )}
                <button
                  type="button"
                  className="widget-item-comment-main"
                  onClick={() => onPostClick(item.post_id, item.floor > 0 ? { floor: item.floor } : undefined)}
                >
                  <span className="widget-item-title">{item.excerpt}</span>
                  <span className="widget-item-time">{item.created_at}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isPostDetail && (
        <div className="widget-card widget-card--about">
          <div className="widget-card-body">
            <div className="widget-about-text">
              {isSiteHome ? (
                <h1 className="widget-about-title">{branding.name}</h1>
              ) : (
                <p className="widget-about-title">{branding.name}</p>
              )}
              <p className="widget-about-desc">{aboutText}</p>
              {description && slogan && slogan !== description && (
                <p className="widget-about-slogan">{slogan}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
