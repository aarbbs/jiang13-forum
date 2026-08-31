import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import BoardBadge from '@/components/BoardBadge';
import FeaturedIcon from '@/components/FeaturedIcon';
import UserLink from '@/components/UserLink';
import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';
import { useForumLimits } from '../hooks/useForumLimits';
import { formatTime } from '../utils/content';
import { boardPath, postPath } from '../utils/permalink';
import { toPostImageThumbSrc } from '../utils/postContent';
import { excerptFromHTML, firstImageFromHTML } from '../utils/seoText';

interface Props {
  post: PostItem;
  sort?: FeedSort;
  /** 当前板块 id，>0 时隐藏行内板块色标（避免板块页重复） */
  boardId?: number;
  onSelect: (id: number) => void;
}

function PostListItem({ post, sort = 'latest', boardId = 0, onSelect }: Props) {
  const nav = useNavigate();
  const { limits } = useForumLimits();
  const feedStyle = limits.feed_list_style ?? 'title';
  const showExcerpt = feedStyle === 'excerpt' || feedStyle === 'thumbnail';
  const showThumb = feedStyle === 'thumbnail';
  const titleOnly = feedStyle === 'title';

  const initial = post.user?.nickname?.[0] || '?';
  const timeLabel = sort === 'reply' && !post.last_reply_at
    ? '暂无回复'
    : formatTime(post.created_at);
  const lastReplyName = post.last_reply_user?.nickname?.trim()
    || post.last_reply_user?.username?.trim()
    || post.last_reply_guest_nick?.trim()
    || '';
  const showLastReply = !!post.last_reply_at && (!!post.last_reply_user || !!lastReplyName);
  const commentCount = post.comment_count ?? 0;
  const href = postPath(post.id);
  const firstImage = firstImageFromHTML(post.content || '');
  const thumbSrc = showThumb && firstImage ? toPostImageThumbSrc(firstImage) : null;
  const excerpt = showExcerpt ? excerptFromHTML(post.content || '', 60) : '';
  const showBoardBadge = !!post.board && boardId !== post.board.id;

  const openPost = () => onSelect(post.id);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPost();
    }
  };
  const onTitleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    openPost();
  };

  const hasTypeBadge = post.post_type === 'question'
    || post.post_type === 'poll'
    || post.post_type === 'lottery'
    || (post.post_type === 'bounty' && (
      (post.bounty_status === 'open' && (post.bounty_points ?? 0) > 0)
      || post.bounty_status === 'awarded'
    ));

  const titleRow = (
    <div className="post-title-row">
      {post.pinned && (
        <span className="post-pin-badge" title="全局置顶">全局置顶</span>
      )}
      {post.board_pinned && (
        <span className="post-pin-badge post-pin-badge--board" title="板块置顶">板块置顶</span>
      )}
      {post.featured && (
        <span className="post-feature-badge" title="推荐">
          <FeaturedIcon size={12} />
          推荐
        </span>
      )}
      {post.status === 'pending' && (
        <span className="post-status-badge post-status-badge--pending" title="审核中">审核中</span>
      )}
      {post.status === 'rejected' && (
        <span className="post-status-badge post-status-badge--rejected" title="未通过">未通过</span>
      )}
      <a href={href} className="post-title" onClick={onTitleClick}>
        {post.title}
      </a>
      {/* 类型徽章放标题后：flex 自动扣宽，长标题省略号紧挨徽章左侧 */}
      {hasTypeBadge && (
        <span className="post-title-type-badges">
          {post.post_type === 'question' && (
            <span
              className={`post-qa-badge${post.question_resolved ? ' post-qa-badge--resolved' : ' post-qa-badge--open'}`}
              title={post.question_resolved ? '已解决' : '未解决'}
            >
              {post.question_resolved ? '已解决' : '未解决'}
            </span>
          )}
          {post.post_type === 'poll' && (
            <span className="post-type-badge post-type-badge--poll" title="投票">投票</span>
          )}
          {post.post_type === 'bounty' && post.bounty_status === 'open' && (post.bounty_points ?? 0) > 0 && (
            <span className="post-bounty-badge post-bounty-badge--open" title="悬赏">悬赏 {post.bounty_points}</span>
          )}
          {post.post_type === 'bounty' && post.bounty_status === 'awarded' && (
            <span className="post-bounty-badge post-bounty-badge--awarded" title="已采纳">已采纳</span>
          )}
          {post.post_type === 'lottery' && (
            <span className="post-type-badge post-type-badge--lottery" title="抽奖">
              {post.lottery_status === 'drawn' ? '已开奖' : '抽奖'}
            </span>
          )}
        </span>
      )}
    </div>
  );

  const metaLeft = (
    <div className="post-meta-left">
      {showBoardBadge && post.board && (
        <button
          type="button"
          className="post-list-board-btn"
          title={`进入板块：${post.board.name}`}
          onClick={(e) => {
            e.stopPropagation();
            nav(boardPath(post.board!.id, limits));
          }}
        >
          <BoardBadge board={post.board} className="post-list-board-badge" />
        </button>
      )}
      <UserLink user={post.user} stopPropagation className="post-meta-author" showBadges={false} />
      <span className="post-meta-sep post-meta-sep--before-time" aria-hidden>·</span>
      <span className="post-meta-time post-meta-time--created">{timeLabel}</span>
      {showLastReply && (
        <span className="post-meta-last-reply">
          <span className="post-meta-last-reply-arrow" aria-hidden>←</span>
          {post.last_reply_user ? (
            <UserLink
              user={post.last_reply_user}
              stopPropagation
              className="post-meta-last-reply-user"
              showBadges={false}
            />
          ) : (
            <span className="post-meta-last-reply-user">{lastReplyName}</span>
          )}
          <span className="post-meta-last-reply-time">{formatTime(post.last_reply_at!)}</span>
        </span>
      )}
    </div>
  );

  const stats = (
    <div className="post-stats">
      <span className={`post-stat${commentCount === 0 ? ' post-stat--zero' : ''}`} title="评论">
        <MessageCircle aria-hidden />
        {commentCount}
      </span>
    </div>
  );

  return (
    <div
      className={`post-row post-row--v2${titleOnly ? ' post-row--title-only' : ''}${thumbSrc ? ' post-row--has-thumb' : ''}`}
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

      {thumbSrc ? (
        <div className="post-main post-main--with-thumb">
          <div className="post-content">
            {titleRow}
            {excerpt && <p className="post-excerpt">{excerpt}</p>}
            <div className="post-meta post-meta--inline">{metaLeft}</div>
          </div>
          <div className="post-aside">
            <div className="post-thumb" aria-hidden>
              <img src={thumbSrc} alt="" loading="lazy" decoding="async" />
            </div>
            {stats}
          </div>
        </div>
      ) : (
        <div className="post-main">
          <div className="post-text">
            {titleRow}
            {excerpt && <p className="post-excerpt">{excerpt}</p>}
          </div>
          <div className="post-meta">
            {metaLeft}
            {stats}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(PostListItem);
