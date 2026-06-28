import { Users, FileText, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Board, ForumStats } from '../api/types';

interface Props {
  boardId: number;
  keyword: string;
  boards: Board[];
  stats: ForumStats | null;
  postTotal: number;
}

export default function FeedHeader({ boardId, keyword, boards, stats, postTotal }: Props) {
  const nav = useNavigate();
  const board = boards.find(b => b.id === boardId);

  const title = keyword
    ? `搜索：${keyword}`
    : (boardId && board ? board.name : '全部帖子');

  const boardHint = boardId && board ? (board.description || '') : '';

  return (
    <div className={`feed-head${keyword ? ' feed-head--solo' : ''}`}>
      <div className="feed-head__title">
        <h2 title={boardHint || undefined}>{title}</h2>
        {!keyword && stats && (
          <div className="feed-head__stats">
            <span className="feed-stat-chip">
              <Users aria-hidden />
              会员 <strong>{stats.users}</strong>
            </span>
            <span className="feed-stat-chip">
              <FileText aria-hidden />
              帖子 <strong>{stats.posts}</strong>
            </span>
            <span className="feed-stat-chip">
              <LayoutGrid aria-hidden />
              板块 <strong>{stats.boards}</strong>
            </span>
          </div>
        )}
      </div>
      {keyword && (
        <button
          type="button"
          className="feed-head__clear"
          onClick={() => nav('/')}
        >
          清除搜索
        </button>
      )}
      {keyword && (
        <span className="feed-toolbar__count">共 {postTotal} 条</span>
      )}
    </div>
  );
}
