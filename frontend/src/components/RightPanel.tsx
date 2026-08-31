import { useMemo } from 'react';
import { ListTree, MessageCircle, Tags, Link2, UserPlus } from 'lucide-react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { AsideWidget, RecentComment, RecentUser, TagCount, User, ForumStats, FriendLink } from '../api/types';
import type { PostHeading } from '../utils/postHeadings';
import { useSiteBranding } from '../hooks/useSiteBranding';
import { formatShortDateTime, formatTime } from '../utils/content';
import { resolveAsideWidgets } from '../utils/asideWidgets';
import TagCloud from './TagCloud';
import UserLink from './UserLink';
import ArticleOutline from './ArticleOutline';
import PostAuthorCard from './PostAuthorCard';
import AsideCheckInStrip from './AsideCheckInStrip';
import ShowcaseAsideWidget from './ShowcaseAsideWidget';

export type PostDetailAside = {
  author?: User | null;
  publishedAt?: string;
  viewCount?: number;
  headings: PostHeading[];
  scrollRoot?: HTMLElement | null;
  outlineTitle?: string;
};

interface Props {
  recentComments: RecentComment[];
  recentUsers: RecentUser[];
  tags?: TagCount[];
  tagsLoading?: boolean;
  stats?: ForumStats | null;
  onPostClick: (id: number, opts?: { floor?: number }) => void;
  /** 首次拉取中：不渲染该块内容（由冷启动门闩保证首屏已齐或空白） */
  loading?: boolean;
  /** 右侧栏可选组件顺序与开关 */
  asideWidgets: AsideWidget[];
  /** 帖子详情：右侧顶部展示作者与目录 */
  postDetail?: PostDetailAside | null;
}

export default function RightPanel({
  recentComments,
  recentUsers,
  tags = [],
  tagsLoading = false,
  stats = null,
  onPostClick,
  loading = false,
  asideWidgets,
  postDetail = null,
}: Props) {
  const { branding } = useSiteBranding();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const activeTag = params.get('tag') || '';
  const commentList = recentComments?.slice(0, 6) ?? [];
  const userList = recentUsers?.slice(0, 8) ?? [];
  const friendLinks = (branding.friend_links ?? []).filter(
    (l: FriendLink) => l.name?.trim() && l.url?.trim(),
  );
  const isSiteHome = loc.pathname === '/'
    && !params.get('board')
    && !params.get('keyword')
    && !params.get('tag')
    && !params.get('author');
  const description = branding.description?.trim() || '';
  const slogan = branding.slogan?.trim() || '';
  const introText = description || slogan;
  const isPostDetail = !!postDetail;

  const enabledWidgets = useMemo(
    () => resolveAsideWidgets({
      aside_widgets: asideWidgets,
      aside_show_tag_cloud: false,
      aside_show_recent_comments: false,
      aside_show_friend_links: false,
    }).filter(w => w.enabled),
    [asideWidgets],
  );

  const handleApplyClick = () => {
    nav('/links?apply=1');
  };

  const renderWidget = (widget: AsideWidget) => {
    switch (widget.id) {
      case 'showcase':
        return <ShowcaseAsideWidget key="showcase" />;
      case 'friend_links':
        return (
          <div key="friend_links" className="widget-card widget-card--friend-links">
            <div className="widget-card-head widget-card-head--split">
              <span className="widget-card-head-main">
                <Link2 className="widget-card-icon widget-card-icon--links" aria-hidden />
                <button type="button" className="widget-friend-links-title" onClick={() => nav('/links')}>
                  友情链接
                </button>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="widget-friend-links-apply"
                onClick={handleApplyClick}
              >
                申请
              </Button>
            </div>
            <div className="widget-card-body widget-card-body--friend-links">
              {friendLinks.length === 0 ? (
                <div className="widget-empty">暂无友情链接</div>
              ) : (
                <>
                  <ul className="widget-friend-links-list">
                    {friendLinks.slice(0, 8).map((link: FriendLink) => (
                      <li key={`${link.name}-${link.url}`}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" title={link.name}>
                          {link.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {friendLinks.length > 8 && (
                    <button type="button" className="widget-friend-links-more" onClick={() => nav('/links')}>
                      查看全部 {friendLinks.length} 个
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      case 'tag_cloud':
        return (
          <div key="tag_cloud" className="widget-card widget-card--tags">
            <div className="widget-card-head">
              <Tags className="widget-card-icon widget-card-icon--tags" aria-hidden />
              标签云
            </div>
            <div className="widget-card-body widget-card-body--tags">
              <TagCloud tags={tags} loading={tagsLoading} activeTag={activeTag} />
            </div>
          </div>
        );
      case 'recent_comments':
        return (
          <div key="recent_comments" className="widget-card">
            <div className="widget-card-head">
              <MessageCircle className="widget-card-icon widget-card-icon--notice" aria-hidden />
              最新评论
            </div>
            <div className="widget-card-body">
              {loading && commentList.length === 0 ? null : commentList.length === 0 ? (
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
                    <span className="widget-item-meta">
                      <span
                        className="widget-item-time"
                        title={formatShortDateTime(item.created_at)}
                      >
                        {formatTime(item.created_at)}
                      </span>
                      {item.post_title && (
                        <span className="widget-item-post-title">{item.post_title}</span>
                      )}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'recent_users':
        return (
          <div key="recent_users" className="widget-card widget-card--users">
            <div className="widget-card-head">
              <UserPlus className="widget-card-icon widget-card-icon--users" aria-hidden />
              最新注册
            </div>
            <div className="widget-card-body widget-card-body--users">
              {loading && userList.length === 0 ? null : userList.length === 0 ? (
                <div className="widget-empty">暂无用户</div>
              ) : (
                <div className="widget-recent-users-grid">
                  {userList.map(item => (
                    <UserLink
                      key={item.id}
                      user={{ id: item.id, nickname: item.nickname, avatar: item.avatar }}
                      className="widget-recent-user-cell"
                      showBadges={false}
                      title={item.nickname}
                    >
                      <span className="widget-recent-user-avatar" aria-hidden>
                        {item.avatar
                          ? <img src={item.avatar} alt="" loading="lazy" decoding="async" />
                          : (item.nickname?.[0] || '?')}
                      </span>
                      <span className="widget-recent-user-name">{item.nickname}</span>
                    </UserLink>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

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

      {!isPostDetail && (
        <div className="widget-card widget-card--about">
          <div className="widget-card-body">
            <div className="widget-about-text">
              {isSiteHome ? (
                <h1 className="widget-about-title">{branding.name}</h1>
              ) : (
                <p className="widget-about-title">{branding.name}</p>
              )}
              {introText && (
                <p className="widget-about-desc">{introText}</p>
              )}
            </div>
            {stats && (
              <div className="widget-stats" aria-label="论坛统计">
                <div className="widget-stat">
                  <span className="widget-stat-value">{stats.posts}</span>
                  <span className="widget-stat-label">帖子</span>
                </div>
                <div className="widget-stat">
                  <span className="widget-stat-value">{stats.comments}</span>
                  <span className="widget-stat-label">回复</span>
                </div>
                <div className="widget-stat">
                  <span className="widget-stat-value">{stats.users}</span>
                  <span className="widget-stat-label">用户</span>
                </div>
              </div>
            )}
            <AsideCheckInStrip />
          </div>
        </div>
      )}

      {!isPostDetail && enabledWidgets.map(renderWidget)}
    </div>
  );
}
