import { memo } from 'react';
import { Eye, Image as ImageIcon, MessageCircle, ThumbsUp } from 'lucide-react';
import BoardBadge from '@/components/BoardBadge';
import FeaturedIcon from '@/components/FeaturedIcon';
import PinnedIcon from '@/components/PinnedIcon';
import UserLink from '@/components/UserLink';
import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';
import { formatTime } from '../utils/content';
import { postPath } from '../utils/permalink';
import { excerptFromHTML, firstImageFromHTML } from '../utils/seoText';

interface Props {
  post: PostItem;
  sort?: FeedSort;
  onSelect: (id: number) => void;
}

function PostListItem({ post, sort = 'latest', onSelect }: Props) {
  const initial = post.user?.nickname?.[0] || '?';
  const timeLabel = sort === 'reply'
    ? (post.last_reply_at
      ? `${formatTime(post.last_reply_at)} 回复`
      : '暂无回复')
    : formatTime(post.created_at);
  const commentCount = post.comment_count ?? 0;
  const likeCount = post.like_count ?? 0;
  const viewCount = post.view_count ?? 0;
  const href = postPath(post.id);
  const excerpt = excerptFromHTML(post.content || '', 72);
  const hasImage = !!firstImageFromHTML(post.content || '');

  const openPost = () => onSelect(post.id);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPost();
    }
  };
  const onTitleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // 修饰键 / 非左键：交给浏览器（新标签等）
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    openPost();
  };

  return (
    <div
      className="post-row"
      role="link"
      tabIndex={0}
      onClick={openPost}
      onKeyDown={onKeyDown}
    >
      <UserLink
        user={post.user}
        showAvatar={false}
        showName={false}
        stopPropagation
        className="post-avatar user-link--avatar-only"
      >
        {post.user?.avatar
          ? <img src={post.user.avatar} alt="" loading="lazy" decoding="async" />
          : initial}
      </UserLink>

      <div className="post-body">
        <div className="post-head">
          <div className="post-head-meta">
            <UserLink user={post.user} stopPropagation className="post-author" />
            <span className="post-head-dot" aria-hidden>·</span>
            <span className="post-time">{timeLabel}</span>
          </div>
          {(post.featured || post.pinned || post.status === 'pending' || post.status === 'rejected') && (
            <div className="post-head-badges">
              {post.status === 'pending' && (
                <span className="post-status-badge post-status-badge--pending" title="审核中">审核中</span>
              )}
              {post.status === 'rejected' && (
                <span className="post-status-badge post-status-badge--rejected" title="未通过">未通过</span>
              )}
              {post.featured && (
                <span className="post-feature-badge" title="精华">
                  <FeaturedIcon size={12} />
                  精华
                </span>
              )}
              {post.pinned && (
                <span className="post-pin-badge" title="置顶">
                  <PinnedIcon size={12} />
                  置顶
                </span>
              )}
            </div>
          )}
        </div>

        <a href={href} className="post-title" onClick={onTitleClick}>
          {post.title}
        </a>

        {excerpt && <p className="post-excerpt">{excerpt}</p>}

        <div className="post-foot">
          <div className="post-foot-left">
            {post.board && <BoardBadge board={post.board} />}
          </div>
          <div className="post-stats">
            {hasImage && (
              <span className="post-stat post-stat--media" title="含图片">
                <ImageIcon aria-hidden />
              </span>
            )}
            <span className={`post-stat${commentCount === 0 ? ' post-stat--zero' : ''}`} title="评论">
              <MessageCircle aria-hidden />
              {commentCount}
            </span>
            <span className={`post-stat${likeCount === 0 ? ' post-stat--zero' : ''}`} title="点赞">
              <ThumbsUp aria-hidden />
              {likeCount}
            </span>
            <span className={`post-stat${viewCount === 0 ? ' post-stat--zero' : ''}`} title="浏览">
              <Eye aria-hidden />
              {viewCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PostListItem);
