import { memo } from 'react';
import { MessageCircle, ThumbsUp } from 'lucide-react';
import BoardBadge from '@/components/BoardBadge';
import PinnedIcon from '@/components/PinnedIcon';
import UserLink from '@/components/UserLink';
import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';
import { formatTime } from '../utils/content';

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

  const openPost = () => onSelect(post.id);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPost();
    }
  };

  return (
    <div
      className="post-row"
      role="button"
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
        <div className="post-title">
          {post.pinned && <PinnedIcon className="mr-1.5" />}
          {post.title}
        </div>
        <div className="post-meta">
          {post.board && <BoardBadge board={post.board} />}
          <UserLink user={post.user} stopPropagation className="post-meta-user" />
          <span>{timeLabel}</span>
        </div>
      </div>
      <div className="post-stats">
        <span className={`post-stat${commentCount === 0 ? ' post-stat--zero' : ''}`}>
          <MessageCircle aria-hidden />
          {commentCount}
        </span>
        <span className={`post-stat${likeCount === 0 ? ' post-stat--zero' : ''}`}>
          <ThumbsUp aria-hidden />
          {likeCount}
        </span>
      </div>
    </div>
  );
}

export default memo(PostListItem);
