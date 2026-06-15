import { Button } from '@/components/ui/button';
import { Plus, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Board, ForumStats } from '../api/types';
import { useAuth } from '../hooks/useAuth';

interface Props {
  boardId: number;
  keyword: string;
  boards: Board[];
  stats: ForumStats | null;
  postTotal: number;
}

export default function FeedHeader({ boardId, keyword, boards, stats, postTotal }: Props) {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const board = boards.find(b => b.id === boardId);

  const title = keyword
    ? `搜索：${keyword}`
    : (boardId && board ? board.name : '全部帖子');

  const hint = keyword
    ? `找到 ${postTotal} 篇相关帖子`
    : boardId && board
      ? (board.description || '欢迎在本板块交流讨论')
      : '姜十三论坛 · 拾三一隅，自在交流';

  return (
    <div className="feed-banner">
      <div className="feed-banner-row">
        <div className="feed-banner-title">
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
        {!keyword && (
          <div className="feed-actions flex flex-wrap items-center gap-2">
            {authLoading ? (
              <span className="feed-action-slot" aria-hidden />
            ) : user ? (
              <Button
                size="sm"
                onClick={() => nav(boardId ? `/compose?board=${boardId}` : '/compose')}
              >
                <Plus />
                {boardId ? '在此发帖' : '发布帖子'}
              </Button>
            ) : (
              <Button size="sm" onClick={() => nav('/login')}>登录参与</Button>
            )}
            {!authLoading && user?.role === 'admin' && (
              <Button size="sm" variant="outline" onClick={() => nav('/boards')}>
                <Settings />
                管理板块
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="feed-stats">
        <span>会员 <strong>{stats?.users ?? '—'}</strong></span>
        <span>帖子 <strong>{stats?.posts ?? '—'}</strong></span>
        <span>板块 <strong>{stats?.boards ?? '—'}</strong></span>
      </div>
    </div>
  );
}
