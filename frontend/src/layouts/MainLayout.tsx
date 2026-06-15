import { useState, useEffect, useCallback, Suspense } from 'react';
import PageLoader from '../components/PageLoader';
import { Outlet, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Moon, Sun, Search, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../hooks/useAuth';
import { useTheme, useMediaQuery } from '../hooks/useTheme';
import { api } from '../api/client';
import type { Board, PostItem, Notification, OnlineStats, ForumStats } from '../api/types';
import { getCachedBoards, getCachedStats, setCachedBoards, setCachedStats } from '../utils/layoutCache';
import Sidebar, { isNeutralSidebarRoute } from '../components/Sidebar';
import RightPanel from '../components/RightPanel';
import { useForumLimits } from '../hooks/useForumLimits';
import { buildHomeUrl, parseFeedSort } from '../components/FeedSortBar';
import { navigateFeed } from '../utils/feedCache';
import { notify } from '@/lib/notify';

export default function MainLayout() {
  const { user, loading: authLoading, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const isCompose = loc.pathname.startsWith('/compose') || /\/post\/\d+\/edit$/.test(loc.pathname);

  const [boards, setBoards] = useState<Board[]>(() => getCachedBoards());
  const [stats, setStats] = useState<ForumStats | null>(() => getCachedStats());
  const [layoutReady, setLayoutReady] = useState(() => getCachedBoards().length > 0 || !!getCachedStats());
  const [hot, setHot] = useState<PostItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [online, setOnline] = useState<OnlineStats | null>(null);
  const [boardId, setBoardId] = useState(Number(params.get('board')) || 0);
  const [keyword, setKeyword] = useState(params.get('keyword') || '');
  const feedSort = parseFeedSort(params.get('sort'));
  const { limits: forumLimits } = useForumLimits();

  useEffect(() => { setBoardId(Number(params.get('board')) || 0); }, [params]);
  useEffect(() => { setKeyword(params.get('keyword') || ''); }, [params]);

  const refreshBoards = useCallback(() => {
    Promise.all([
      api.boards().then(d => {
        const next = d.boards ?? [];
        setBoards(next);
        setCachedBoards(next);
        return next;
      }).catch(() => [] as Board[]),
      api.stats().then(next => {
        setStats(next);
        setCachedStats(next);
        return next;
      }).catch(() => null),
    ]).finally(() => setLayoutReady(true));
  }, []);

  const refreshOnline = useCallback(() => {
    api.online().then(d => {
      setOnline({
        count: d.count ?? 0,
        members: d.members ?? 0,
        guests: d.guests ?? 0,
        users: Array.isArray(d.users) ? d.users : [],
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshBoards();
    api.hotPosts().then(d => setHot(Array.isArray(d.posts) ? d.posts : [])).catch(() => {});
    api.notifications().then(d => setNotifications(Array.isArray(d.notifications) ? d.notifications : [])).catch(() => {});
    refreshOnline();
    api.presence().catch(() => {});
    const onlineTimer = setInterval(refreshOnline, 30000);
    const presenceTimer = setInterval(() => api.presence().catch(() => {}), 60000);
    const onRefresh = () => refreshBoards();
    window.addEventListener('boards-refresh', onRefresh);
    return () => {
      clearInterval(onlineTimer);
      clearInterval(presenceTimer);
      window.removeEventListener('boards-refresh', onRefresh);
    };
  }, [refreshBoards, refreshOnline]);

  const doSearch = () => {
    const kw = keyword.trim();
    if (!kw) {
      nav('/');
      return;
    }
    const len = [...kw].length;
    if (forumLimits.search_keyword_min > 0 && len < forumLimits.search_keyword_min) {
      notify.warning(`搜索关键词至少 ${forumLimits.search_keyword_min} 个字`);
      return;
    }
    if (forumLimits.search_keyword_max > 0 && len > forumLimits.search_keyword_max) {
      notify.warning(`搜索关键词最多 ${forumLimits.search_keyword_max} 个字`);
      return;
    }
    nav(`/?keyword=${encodeURIComponent(kw)}`);
  };

  const userInitial = user?.nickname?.charAt(0) || '?';
  const mobileActiveBoard = isNeutralSidebarRoute(loc.pathname) ? -1 : boardId;

  return (
    <div className="app-shell">
      <div className="app-frame">
      <header className="app-header">
        <div className="header-inner">
          <button type="button" className="header-brand" onClick={() => navigateFeed(nav, '/')}>
            <span className="header-logo-mark">姜</span>
            {!isMobile && <span className="header-logo-text">姜十三论坛</span>}
          </button>

          {!isCompose && (
          <div className="header-search-wrap">
            <Search className="header-search-icon" size={16} />
            <input
              className="header-search-input"
              type="search"
              placeholder="搜索帖子..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              maxLength={forumLimits.search_keyword_max > 0 ? forumLimits.search_keyword_max : undefined}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
            {keyword && (
              <button
                type="button"
                className="header-search-clear"
                onClick={() => { setKeyword(''); nav('/'); }}
                aria-label="清除搜索"
              >×</button>
            )}
          </div>
          )}

          <div className="header-actions">
            {!isCompose && (
            <button
              type="button"
              className="header-compose-btn"
              onClick={() => user ? nav('/compose') : nav('/login')}
            >
              <Plus size={16} />
              {!isMobile && <span>发帖</span>}
            </button>
            )}

            <div className="header-action-group">
              <button
                type="button"
                className="header-icon-btn"
                onClick={toggle}
                title={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>

              {authLoading ? (
                <span className="header-auth-slot header-auth-slot--loading" aria-hidden />
              ) : user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="header-user-btn" title={user.nickname}>
                      {user.avatar
                        ? <img src={user.avatar} alt="" className="header-user-avatar" />
                        : <span className="header-user-initial">{userInitial}</span>}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-40"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <DropdownMenuItem onClick={() => nav('/profile')}>个人中心</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => nav('/favorites')}>我的收藏</DropdownMenuItem>
                    {user.role === 'admin' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => nav('/admin/dashboard')}>管理后台</DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => logout().then(() => nav('/login'))}>
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button type="button" className="header-login-btn" onClick={() => nav('/login')}>
                  登录
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className={`app-body${isCompose ? ' app-body--compose' : ''}`}>
        {!isCompose && (
          <Sidebar
            boards={boards}
            activeBoard={boardId}
            onSelectBoard={setBoardId}
          />
        )}

        <div className={`content-workspace${isCompose ? ' content-workspace--compose' : ''}`}>
        <main className={`main-content${isCompose ? ' main-content--compose' : ''}`}>
          {isMobile && !isCompose && (
            <div className="mobile-board-bar">
              <span
                className={`board-chip ${mobileActiveBoard === 0 ? 'active' : ''}`}
                onClick={() => { setBoardId(0); navigateFeed(nav, buildHomeUrl(0, feedSort)); }}
              >全部</span>
              {boards.map(b => (
                <span
                  key={b.id}
                  className={`board-chip ${mobileActiveBoard === b.id ? 'active' : ''}`}
                  onClick={() => { setBoardId(b.id); navigateFeed(nav, buildHomeUrl(b.id, feedSort)); }}
                >{b.name}</span>
              ))}
            </div>
          )}
          <Suspense fallback={<PageLoader />}>
            <Outlet context={{
              boardId,
              keyword: params.get('keyword') || '',
              setBoardId,
              boards,
              stats,
              layoutReady,
              refreshBoards,
              isMobile,
            } satisfies LayoutCtx} />
          </Suspense>
        </main>

        {!isCompose && (
        <aside className="aside-panel">
          <RightPanel
            hot={hot}
            notifications={notifications}
            online={online}
            onPostClick={(id) => nav(`/post/${id}`)}
          />
        </aside>
        )}
        </div>
      </div>
      </div>
    </div>
  );
}

export type LayoutCtx = {
  boardId: number;
  keyword: string;
  setBoardId: (id: number) => void;
  boards: Board[];
  stats: ForumStats | null;
  layoutReady: boolean;
  refreshBoards: () => void;
  isMobile: boolean;
};
