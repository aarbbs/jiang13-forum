import { Badge } from '@/components/ui/badge';
import type { PostItem } from '../api/types';
import { formatTime } from '../utils/content';

interface Props {
  post: PostItem;
  onClick: () => void;
}

export default function PostListItem({ post, onClick }: Props) {
  const initial = post.user?.nickname?.[0] || '?';

  return (
    <div className="post-row" onClick={onClick}>
      <div className="post-avatar">
        {post.user?.avatar ? <img src={post.user.avatar} alt="" /> : initial}
      </div>
      <div className="post-body">
        <div className="post-title">
          {post.pinned && <Badge variant="orange" className="mr-1.5">置顶</Badge>}
          {post.title}
        </div>
        <div className="post-meta">
          {post.board && <Badge variant="green">{post.board.name}</Badge>}
          <span>{post.user?.nickname || '匿名'}</span>
          <span>{formatTime(post.created_at)}</span>
        </div>
      </div>
      <div className="post-stats">
        <span>💬 {post.comment_count ?? 0}</span>
        <span>👍 {post.like_count ?? 0}</span>
      </div>
    </div>
  );
}
