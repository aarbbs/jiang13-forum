import {
  Home, Star, LayoutDashboard, FolderGit2, FolderKanban, ArrowLeft, FileText, Link2,
} from 'lucide-react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import type { Board } from '../api/types';
import type { PostHeading } from '../utils/postHeadings';
import { useAuth } from '../hooks/useAuth';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { buildHomeUrl, parseFeedSort } from './FeedSortBar';
import { navigateFeed } from '../utils/feedCache';
import BoardIconDisplay from './BoardIconDisplay';
import { getBoardThemeIndex } from '../utils/boardTheme';
import ArticleOutline from './ArticleOutline';
import { useSitePages } from '../hooks/useSitePages';
import { pagePath } from '../utils/permalink';
import { useForumLimits } from '../hooks/useForumLimits';

// 内容页不参与左侧栏高亮（非 feed 浏览上下文）
const NEUTRAL_SIDEBAR_PREFIXES = ['/post/', '/profile', '/user/', '/page/'];

export function isNeutralSidebarRoute(pathname: string): boolean {
  return NEUTRAL_SIDEBAR_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function resolveMenuKey(pathname: string, activeBoard: number, keyword = ''): string | null {
  if (isNeutralSidebarRoute(pathname)) return null;
  // 搜索结果不属于「全部帖子」或某一板块，取消侧栏选中高亮
  if (keyword.trim()) return null;
  if (pathname.startsWith('/favorites')) return 'favorites';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/links')) return 'links';
  if (pathname.startsWith('/page/')) return 'pages';
  if (pathname.startsWith('/admin')) return 'admin';
  return activeBoard === 0 ? 'all' : String(activeBoard);
}

interface Props {
  boards: Board[];
  activeBoard: number;
  onSelectBoard: (id: number) => void;
  /** 板块列表首次拉取中 */
  boardsLoading?: boolean;
  /** 帖子详情：左侧切换为文章目录 */
  outlineMode?: boolean;
  outlineHeadings?: PostHeading[];
  outlineScrollRoot?: HTMLElement | null;
  outlineTitle?: string;
}

export default function Sidebar({
  boards,
  activeBoard,
  onSelectBoard,
  boardsLoading = false,
  outlineMode = false,
  outlineHeadings = [],
  outlineScrollRoot = null,
  outlineTitle,
}: Props) {
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const sort = parseFeedSort(params.get('sort'));
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { navPages } = useSitePages();
  const { limits } = useForumLimits();
  const showFriendLinksNav = limits.nav_show_friend_links !== false;
  const showSiteSection = navPages.length > 0 || showFriendLinksNav;

  const keyword = params.get('keyword') || '';
  const menuKey = resolveMenuKey(loc.pathname, activeBoard, keyword);
  const permalinkOpts = { permalink: limits };

  const feedNavLink = (
    key: string,
    to: string,
    label: React.ReactNode,
    icon: React.ReactNode,
    selectId: number,
    className?: string,
    trailing?: React.ReactNode,
  ) => (
    <Link
      key={key}
      to={to}
      className={cn('sidebar-nav-item', className, menuKey != null && menuKey === key && 'active')}
      onClick={(e) => {
        e.preventDefault();
        onSelectBoard(selectId);
        navigateFeed(nav, to);
      }}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  );

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

  if (outlineMode) {
    return (
      <aside className="sidebar sidebar--outline">
        <button
          type="button"
          className="sidebar-nav-item sidebar-outline-back"
          onClick={() => navigateFeed(nav, '/')}
        >
          <ArrowLeft aria-hidden />
          <span className="flex-1 truncate">返回首页</span>
        </button>
        <ArticleOutline
          headings={outlineHeadings}
          scrollRoot={outlineScrollRoot}
          title={outlineTitle || '文章目录'}
        />
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-section">浏览</div>
      <nav className="sidebar-nav">
        {feedNavLink('all', buildHomeUrl(0, sort, permalinkOpts), '全部帖子', <Home aria-hidden />, 0)}
        {user && navItem('favorites', '我的收藏', <Star aria-hidden />, () => nav('/favorites'))}
        {navItem('projects', '开源码桶', <FolderGit2 aria-hidden />, () => nav('/projects'))}
      </nav>

      {(boardsLoading && boards.length === 0) ? (
        <>
          <div className="sidebar-section sidebar-section--boards">板块</div>
          <nav className="sidebar-nav sidebar-nav--skeleton" aria-busy="true" aria-label="板块加载中">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="sidebar-nav-item sidebar-nav-item--skeleton">
                <Skeleton className="skeleton--sidebar-icon" />
                <Skeleton className="skeleton--sidebar-label" style={{ width: `${58 + (i % 3) * 12}%` }} />
              </div>
            ))}
          </nav>
        </>
      ) : boards.length > 0 ? (
        <>
          <div className="sidebar-section sidebar-section--boards">板块</div>
          <nav className="sidebar-nav">
            {boards.map(b => {
              const isActive = menuKey != null && menuKey === String(b.id);
              const themeIdx = getBoardThemeIndex(b);
              const boardUrl = buildHomeUrl(b.id, sort, permalinkOpts);
              const postMeta = (b.post_count ?? 0) > 0 ? (
                <span className="sidebar-nav-item__meta" title={`${b.post_count} 篇帖子`}>
                  {b.post_count} 帖
                </span>
              ) : null;
              return feedNavLink(
                String(b.id),
                boardUrl,
                b.name,
                <BoardIconDisplay
                  board={b}
                  className={cn('sidebar-board-icon', `sidebar-board-icon--${themeIdx}`)}
                />,
                b.id,
                cn(
                  'sidebar-nav-item--board',
                  isActive && 'active',
                  isActive && `sidebar-nav-item--board-${themeIdx}`,
                ),
                postMeta,
              );
            })}
          </nav>
        </>
      ) : isAdmin ? (
        <>
          <div className="sidebar-section sidebar-section--boards">板块</div>
          <nav className="sidebar-nav">
            {navItem('boards-empty', '创建第一个板块', <FolderKanban aria-hidden />, () => nav('/admin/boards'))}
          </nav>
        </>
      ) : null}

      {showSiteSection && (
        <>
          <div className="sidebar-section sidebar-section--spaced">站点</div>
          <nav className="sidebar-nav">
            {showFriendLinksNav && navItem('links', '友情链接', <Link2 aria-hidden />, () => nav('/links'))}
            {navPages.map(p => (
              navItem(`page-${p.slug}`, p.title, <FileText aria-hidden />, () => nav(pagePath(p.slug, limits)))
            ))}
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
