import {
  Home, Star, LayoutDashboard,
} from 'lucide-react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import type { Board } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { cn } from '@/lib/utils';
import { buildHomeUrl, parseFeedSort } from './FeedSortBar';
import { navigateFeed } from '../utils/feedCache';
import BoardIconDisplay from './BoardIconDisplay';
import { getBoardThemeIndex } from '../utils/boardTheme';

// 内容页不参与左侧栏高亮（非 feed 浏览上下文）
const NEUTRAL_SIDEBAR_PREFIXES = ['/post/', '/profile'];

export function isNeutralSidebarRoute(pathname: string): boolean {
  return NEUTRAL_SIDEBAR_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function resolveMenuKey(pathname: string, activeBoard: number): string | null {
  if (isNeutralSidebarRoute(pathname)) return null;
  if (pathname.startsWith('/favorites')) return 'favorites';
  if (pathname.startsWith('/admin')) return 'admin';
  return activeBoard === 0 ? 'all' : String(activeBoard);
}

interface Props {
  boards: Board[];
  activeBoard: number;
  onSelectBoard: (id: number) => void;
}

export default function Sidebar({ boards, activeBoard, onSelectBoard }: Props) {
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const sort = parseFeedSort(params.get('sort'));
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const menuKey = resolveMenuKey(loc.pathname, activeBoard);

  const navItem = (key: string, label: React.ReactNode, icon?: React.ReactNode, onClick?: () => void) => (
    <button
      type="button"
      key={key}
      className={cn('sidebar-nav-item', menuKey != null && menuKey === key && 'active')}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-section">浏览</div>
      <nav className="sidebar-nav">
        {navItem('all', '全部帖子', <Home aria-hidden />, () => { onSelectBoard(0); navigateFeed(nav, buildHomeUrl(0, sort)); })}
        {user && navItem('favorites', '我的收藏', <Star aria-hidden />, () => nav('/favorites'))}
      </nav>

      {boards.length > 0 && (
        <>
          <div className="sidebar-section sidebar-section--boards">板块</div>
          <nav className="sidebar-nav">
            {boards.map(b => {
              const isActive = menuKey != null && menuKey === String(b.id);
              const themeIdx = getBoardThemeIndex(b);
              return (
                <button
                  type="button"
                  key={b.id}
                  className={cn(
                    'sidebar-nav-item',
                    'sidebar-nav-item--board',
                    isActive && 'active',
                    isActive && `sidebar-nav-item--board-${themeIdx}`,
                  )}
                  onClick={() => { onSelectBoard(b.id); navigateFeed(nav, buildHomeUrl(b.id, sort)); }}
                >
                  <BoardIconDisplay
                    board={b}
                    className={cn('sidebar-board-icon', `sidebar-board-icon--${themeIdx}`)}
                  />
                  <span className="flex-1 truncate">{b.name}</span>
                  {(b.post_count ?? 0) > 0 && (
                    <span className="sidebar-nav-item__meta">{b.post_count}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </>
      )}

      {isAdmin && (
        <>
          <div className="sidebar-section sidebar-section--spaced">管理</div>
          <nav className="sidebar-nav">
            {navItem('admin', '管理后台', <LayoutDashboard aria-hidden />, () => nav('/admin/dashboard'))}
          </nav>
        </>
      )}
    </aside>
  );
}
