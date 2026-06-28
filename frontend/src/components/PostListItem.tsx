import { MessageCircle, ThumbsUp } from 'lucide-react';
import BoardBadge from '@/components/BoardBadge';
import PinnedIcon from '@/components/PinnedIcon';
import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';
import { formatTime } from '../utils/content';

interface Props {
  post: PostItem;
  sort?: FeedSort;
  onClick: () => void;
}

export default function PostListItem({ post, sort = 'latest', onClick }: Props) {
  const initial = post.user?.nickname?.[0] || '?';
  const timeLabel = sort === 'reply'
    ? (post.last_reply_at
      ? `${formatTime(post.last_reply_at)} 回复`
      : '暂无回复')
    : formatTime(post.created_at);
  const commentCount = post.comment_count ?? 0;
  const likeCount = post.like_count ?? 0;

  return (
    <div className="post-row" onClick={onClick}>
      <div className="post-avatar">
        {post.user?.avatar ? <img src={post.user.avatar} alt="" /> : initial}
      </div>
      <div className="post-body">
        <div className="post-title">
          {post.pinned && <PinnedIcon className="mr-1.5" />}
          {post.title}
        </div>
        <div className="post-meta">
          {post.board && <BoardBadge board={post.board} />}
          <span>{post.user?.nickname || '匿名'}</span>
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
