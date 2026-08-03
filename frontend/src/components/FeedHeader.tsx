import { Users, FileText, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Board, ForumStats } from '../api/types';

interface Props {
  boardId: number;
  keyword: string;
  boards: Board[];
  stats: ForumStats | null;
  postTotal: number;
  /** 首页「全部帖子」用 h2，板块/搜索页用 h1 */
  titleAs?: 'h1' | 'h2';
}

export default function FeedHeader({ boardId, keyword, boards, stats, postTotal, titleAs = 'h1' }: Props) {
  const nav = useNavigate();
  const board = boards.find(b => b.id === boardId);

  const title = keyword
    ? `搜索：${keyword}`
    : (boardId && board ? board.name : '全部帖子');

  const boardHint = boardId && board ? (board.description || '') : '';
  const TitleTag = titleAs;
  const inBoard = !keyword && boardId > 0 && !!board;

  return (
    <div className={`feed-head${keyword ? ' feed-head--solo' : ''}`}>
      <div className="feed-head__title">
        <TitleTag title={boardHint || undefined}>{title}</TitleTag>
        {!keyword && inBoard && (
          <div className="feed-head__stats">
            <span className="feed-stat-chip">
              <FileText aria-hidden />
              本板块 <strong>{postTotal}</strong> 帖
            </span>
            {stats && (
              <span className="feed-stat-chip feed-stat-chip--muted" title="全站统计">
                全站 {stats.posts} 帖 · {stats.users} 会员
              </span>
            )}
          </div>
        )}
        {!keyword && !inBoard && stats && (
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
