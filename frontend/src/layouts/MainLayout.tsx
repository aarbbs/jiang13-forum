import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import PageLoader from '../components/PageLoader';
import FeedPageSkeleton from '../components/FeedPageSkeleton';
import { Outlet, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Moon, Sun, Search, Plus, PanelRight, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../hooks/useAuth';
import { useTheme, useMediaQuery } from '../hooks/useTheme';
import { useOverlayA11y, moveTabIndex } from '../hooks/useOverlayA11y';
import { api } from '../api/client';
import type { Board, PostItem, RecentComment, ForumStats, TagCount } from '../api/types';
import type { PostHeading } from '../utils/postHeadings';
import { getCachedBoards, getCachedStats, getCachedHot, getCachedRecentComments, getCachedTags, hasCachedAside, setCachedBoards, setCachedStats, setCachedHot, setCachedRecentComments, setCachedTags } from '../utils/layoutCache';
import Sidebar, { isNeutralSidebarRoute } from '../components/Sidebar';
import RightPanel from '../components/RightPanel';
import BackToTop from '../components/BackToTop';
import { useForumLimits } from '../hooks/useForumLimits';
import { buildHomeUrl, parseFeedSort } from '../components/FeedSortBar';
import { navigateFeed } from '../utils/feedCache';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { getBoardThemeIndex } from '../utils/boardTheme';
import { loginPath } from '../utils/authRedirect';
import { openForumPost } from '../utils/openPost';
import { useSiteBranding } from '../hooks/useSiteBranding';
import SiteBrandMark from '../components/SiteBrandMark';

export default function MainLayout() {
  const { user, loading: authLoading, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { branding } = useSiteBranding();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const hideAside = useMediaQuery('(max-width: 1100px)');
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const isCompose = loc.pathname.startsWith('/compose') || /\/post\/\d+\/edit$/.test(loc.pathname);

  const [boards, setBoards] = useState<Board[]>(() => getCachedBoards());
  const [stats, setStats] = useState<ForumStats | null>(() => getCachedStats());
  const [hot, setHot] = useState<PostItem[]>(() => getCachedHot());
  const [recentComments, setRecentComments] = useState<RecentComment[]>(() => getCachedRecentComments());
  const [tags, setTags] = useState<TagCount[]>(() => getCachedTags());
  const [tagsLoading, setTagsLoading] = useState(() => getCachedTags().length === 0);
  const [postOutline, setPostOutline] = useState<{
    headings: PostHeading[];
    scrollRoot: HTMLElement | null;
    title?: string;
  } | null>(null);
  const [asideOpen, setAsideOpen] = useState(false);
  const [asideLoading, setAsideLoading] = useState(() => !hasCachedAside());
  const [boardsLoading, setBoardsLoading] = useState(() => getCachedBoards().length === 0);
  const asideEverLoaded = useRef(false);
  const [boardId, setBoardId] = useState(Number(params.get('board')) || 0);
  const [keyword, setKeyword] = useState(params.get('keyword') || '');
  const feedSort = parseFeedSort(params.get('sort'));
  const { limits: forumLimits } = useForumLimits();

  const asideDrawerRef = useRef<HTMLElement>(null);
  const asideCloseRef = useRef<HTMLButtonElement>(null);
  const boardBarRef = useRef<HTMLDivElement>(null);

  const closeAside = useCallback(() => setAsideOpen(false), []);
  useOverlayA11y(asideOpen && hideAside && !isCompose, closeAside, asideDrawerRef, {
    initialFocusRef: asideCloseRef,
  });

  useEffect(() => { setBoardId(Number(params.get('board')) || 0); }, [params]);
  useEffect(() => { setKeyword(params.get('keyword') || ''); }, [params]);
  useEffect(() => { setAsideOpen(false); }, [loc.pathname, loc.search]);
  useEffect(() => {
    if (!/^\/post\/\d+/.test(loc.pathname)) setPostOutline(null);
  }, [loc.pathname]);
  useEffect(() => {
    if (!hideAside) setAsideOpen(false);
  }, [hideAside]);
  useEffect(() => {
    if (!asideOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [asideOpen]);

  const refreshBoards = useCallback(() => {
    return Promise.all([
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
    ]).finally(() => {
      setBoardsLoading(false);
    });
  }, []);

  useEffect(() => {
    refreshBoards();
    const onRefresh = () => refreshBoards();
    window.addEventListener('boards-refresh', onRefresh);
    return () => window.removeEventListener('boards-refresh', onRefresh);
  }, [refreshBoards]);

  // 标签云：非编辑页拉取（左侧栏常显）
  useEffect(() => {
    if (isCompose) return;
    let cancelled = false;
    const loadTags = () => {
      if (getCachedTags().length === 0) setTagsLoading(true);
      api.tags(40).then(d => {
        if (cancelled) return;
        const next = Array.isArray(d.tags) ? d.tags : [];
        setTags(next);
        setCachedTags(next);
      }).catch(() => {}).finally(() => {
        if (!cancelled) setTagsLoading(false);
      });
    };
    loadTags();
    const onRefresh = () => loadTags();
    window.addEventListener('posts-refresh', onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('posts-refresh', onRefresh);
    };
  }, [isCompose]);

  const needAsideData = !isCompose && (!hideAside || asideOpen);
  useEffect(() => {
    if (!needAsideData) return;
    let cancelled = false;
    // 无缓存时才显示加载态，有缓存则静默刷新，避免抽屉高度跳动
    if (!asideEverLoaded.current && !hasCachedAside()) {
      setAsideLoading(true);
    }

    Promise.all([
      api.hotPosts().then(d => {
        if (cancelled) return;
        const next = Array.isArray(d.posts) ? d.posts : [];
        setHot(next);
        setCachedHot(next);
      }).catch(() => {}),
      api.recentComments().then(d => {
        if (cancelled) return;
        const next = Array.isArray(d.comments) ? d.comments : [];
        setRecentComments(next);
        setCachedRecentComments(next);
      }).catch(() => {}),
    ]).finally(() => {
      if (!cancelled) {
        asideEverLoaded.current = true;
        setAsideLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [needAsideData]);

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

  const openPost = useCallback((id: number) => {
    setAsideOpen(false);
    openForumPost(nav, id, forumLimits.open_posts_in_new_tab);
  }, [nav, forumLimits.open_posts_in_new_tab]);

  const userInitial = user?.nickname?.charAt(0) || '?';
  const isFeedHome = loc.pathname === '/';
  const mobileActiveBoard = isNeutralSidebarRoute(loc.pathname) ? -1 : boardId;

  const boardChipIds = useMemo(() => [0, ...boards.map(b => b.id)], [boards]);
  const activeChipIndex = Math.max(0, boardChipIds.indexOf(mobileActiveBoard === -1 ? 0 : mobileActiveBoard));

  const outletKeyword = params.get('keyword') || '';
  const isPostDetail = /^\/post\/\d+\/?$/.test(loc.pathname);
  const setPostOutlineSafe = useCallback((outline: LayoutCtx['postOutline']) => {
    setPostOutline(outline);
  }, []);
  const layoutCtx = useMemo<LayoutCtx>(() => ({
    boardId,
    keyword: outletKeyword,
    setBoardId,
    boards,
    stats,
    refreshBoards,
    isMobile,
    setPostOutline: setPostOutlineSafe,
  }), [boardId, outletKeyword, boards, stats, refreshBoards, isMobile, setPostOutlineSafe]);

  const selectBoardChip = (id: number) => {
    setBoardId(id);
    navigateFeed(nav, buildHomeUrl(id, feedSort));
  };

  const onBoardBarKeyDown = (e: React.KeyboardEvent) => {
    const next = moveTabIndex(e.key, activeChipIndex, boardChipIds.length);
    if (next == null) return;
    e.preventDefault();
    selectBoardChip(boardChipIds[next]);
    requestAnimationFrame(() => {
      const tabs = boardBarRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
      tabs?.[next]?.focus();
    });
  };

  return (
    <div className="app-shell">
      <div className="app-frame">
      <header className="app-header">
        <div className="header-inner">
          <button type="button" className="header-brand" onClick={() => navigateFeed(nav, '/')}>
            <SiteBrandMark branding={branding} className="header-logo-mark" />
            {!isMobile && <span className="header-logo-text">{branding.name}</span>}
          </button>

          {!isCompose && (
          <div className="header-search-wrap">
            <Search className="header-search-icon" size={16} aria-hidden />
            <input
              className="header-search-input"
              type="search"
              placeholder="搜索帖子..."
              aria-label="搜索帖子"
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
              onClick={() => user ? nav('/compose') : nav(loginPath('/compose'))}
              aria-label="发帖"
            >
              <Plus size={16} aria-hidden />
              {!isMobile && <span>发帖</span>}
            </button>
            )}

            <div className="header-action-group">
              {!isCompose && hideAside && (
                <button
                  type="button"
                  className="header-icon-btn"
                  onClick={() => setAsideOpen(true)}
                  aria-label="打开社区动态"
                  aria-expanded={asideOpen}
                  aria-controls="aside-drawer"
                  title="社区动态"
                >
                  <PanelRight size={18} aria-hidden />
                </button>
              )}

              <button
                type="button"
                className="header-icon-btn"
                onClick={toggle}
                aria-label={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
                title={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
              >
                {theme === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
              </button>

              {authLoading ? (
                <span className="header-auth-slot header-auth-slot--loading" aria-hidden />
              ) : user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="header-user-btn" title={user.nickname} aria-label={`用户菜单：${user.nickname}`}>
                      {user.avatar
                        ? <img src={user.avatar} alt="" className="header-user-avatar" loading="lazy" decoding="async" />
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
                <button type="button" className="header-login-btn" onClick={() => nav(loginPath())}>
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
            boardsLoading={boardsLoading}
            outlineMode={isPostDetail}
            outlineHeadings={postOutline?.headings ?? []}
            outlineScrollRoot={postOutline?.scrollRoot ?? null}
            outlineTitle={postOutline?.title}
          />
        )}

        <div className={`content-workspace${isCompose ? ' content-workspace--compose' : ''}`}>
        <main className={`main-content${isCompose ? ' main-content--compose' : ''}`}>
          {isMobile && !isCompose && isFeedHome && (
            <div
              ref={boardBarRef}
              className="mobile-board-bar"
              role="tablist"
              aria-label="板块"
              onKeyDown={onBoardBarKeyDown}
            >
              <button
                type="button"
                role="tab"
                tabIndex={activeChipIndex === 0 ? 0 : -1}
                aria-selected={mobileActiveBoard === 0}
                className={`board-chip ${mobileActiveBoard === 0 ? 'active' : ''}`}
                onClick={() => selectBoardChip(0)}
              >全部</button>
              {boards.map((b, i) => {
                const themeIdx = getBoardThemeIndex(b);
                const isActive = mobileActiveBoard === b.id;
                const idx = i + 1;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="tab"
                    tabIndex={activeChipIndex === idx ? 0 : -1}
                    aria-selected={isActive}
                    className={cn(
                      'board-chip',
                      isActive && 'active',
                      isActive && `board-chip--${themeIdx}`,
                    )}
                    onClick={() => selectBoardChip(b.id)}
                  >{b.name}</button>
                );
              })}
            </div>
          )}
          <Suspense fallback={isFeedHome ? <FeedPageSkeleton /> : <PageLoader />}>
            <Outlet context={layoutCtx} />
          </Suspense>
        </main>

        {!isCompose && (
        <aside className="aside-panel">
          <RightPanel
            hot={hot}
            recentComments={recentComments}
            tags={tags}
            tagsLoading={tagsLoading}
            loading={asideLoading}
            onPostClick={openPost}
          />
        </aside>
        )}
        </div>
      </div>
      </div>

      {asideOpen && hideAside && !isCompose && (
        <div className="aside-drawer-root">
          <button
            type="button"
            className="aside-drawer-backdrop"
            aria-label="关闭社区动态"
            tabIndex={-1}
            onClick={closeAside}
          />
          <aside
            id="aside-drawer"
            ref={asideDrawerRef}
            className="aside-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="社区动态"
          >
            <div className="aside-drawer-head">
              <span>社区动态</span>
              <button
                ref={asideCloseRef}
                type="button"
                className="header-icon-btn"
                aria-label="关闭"
                onClick={closeAside}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="aside-drawer-body">
              <RightPanel
                hot={hot}
                recentComments={recentComments}
                tags={tags}
                tagsLoading={tagsLoading}
                loading={asideLoading}
                onPostClick={openPost}
              />
            </div>
          </aside>
        </div>
      )}

      <BackToTop />
    </div>
  );
}

export type LayoutCtx = {
  boardId: number;
  keyword: string;
  setBoardId: (id: number) => void;
  boards: Board[];
  stats: ForumStats | null;
  refreshBoards: () => void;
  isMobile: boolean;
  /** 详情页上报文章目录，供左侧栏展示 */
  setPostOutline: (outline: {
    headings: PostHeading[];
    scrollRoot: HTMLElement | null;
    title?: string;
  } | null) => void;
};
