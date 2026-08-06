import { Users, FileText, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Board, ForumStats } from '../api/types';

interface Props {
  boardId: number;
  keyword: string;
  tag?: string;
  author?: string;
  titleOnly?: boolean;
  boards: Board[];
  stats: ForumStats | null;
  postTotal: number;
  /** 搜索页用 h1；首页/板块页中间栏不再展示标题 */
  titleAs?: 'h1' | 'h2';
}

export default function FeedHeader({
  boardId,
  keyword,
  tag = '',
  author = '',
  titleOnly = false,
  boards,
  stats,
  postTotal,
  titleAs = 'h1',
}: Props) {
  const nav = useNavigate();
  const board = boards.find(b => b.id === boardId);

  const filtered = !!(keyword || tag || author);
  const inBoard = !filtered && boardId > 0 && !!board;
  /** 侧栏已有「全部帖子 / 板块名」，中间栏不再重复；仅搜索/标签保留标题 */
  let title = '';
  if (tag) title = `标签：${tag}`;
  else if (keyword || author) {
    const parts: string[] = [];
    if (keyword) parts.push(titleOnly ? `标题含「${keyword}」` : `搜索：${keyword}`);
    if (author) parts.push(`作者 ${author}`);
    if (boardId && board) parts.push(`板块 ${board.name}`);
    title = parts.join(' · ');
  }
  const TitleTag = titleAs;

  return (
    <div className={`feed-head${filtered ? ' feed-head--solo' : ' feed-head--stats-only'}`}>
      <div className="feed-head__title">
        {title ? <TitleTag>{title}</TitleTag> : null}
        {!filtered && inBoard && (
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
        {!filtered && !inBoard && stats && (
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
      {filtered && (
        <button
          type="button"
          className="feed-head__clear"
          onClick={() => nav('/')}
        >
          {tag ? '清除标签' : '清除搜索'}
        </button>
      )}
      {filtered && (
        <span className="feed-toolbar__count">共 {postTotal} 条</span>
      )}
    </div>
  );
}
