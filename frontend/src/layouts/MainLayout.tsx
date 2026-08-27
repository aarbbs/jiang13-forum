import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import PageLoader from '../components/PageLoader';
import FeedPageSkeleton from '../components/FeedPageSkeleton';
import { Outlet, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Menu, Moon, Sun, Search, Plus, PanelRight, X, Mail, SlidersHorizontal } from 'lucide-react';
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
import type { Board, RecentComment, RecentUser, ForumStats, TagCount, User } from '../api/types';
import type { PostHeading } from '../utils/postHeadings';
import { getCachedBoards, getCachedStats, getCachedRecentComments, getCachedRecentUsers, getCachedTags, hasCachedAside, setCachedBoards, setCachedStats, setCachedRecentComments, setCachedRecentUsers, setCachedTags } from '../utils/layoutCache';
import Sidebar, { isNeutralSidebarRoute } from '../components/Sidebar';
import RightPanel from '../components/RightPanel';
import BackToTop from '../components/BackToTop';
import { useForumLimits } from '../hooks/useForumLimits';
import { resolveAsideWidgets } from '../utils/asideWidgets';
import { buildHomeUrl, parseFeedSort } from '../components/FeedSortBar';
import { navigateFeed } from '../utils/feedCache';
import PostSearchPanel from '../components/search/PostSearchPanel';
import {
  POST_SEARCH_OPEN_EVENT,
  usePostSearch,
} from '../hooks/usePostSearch';
import { cn } from '@/lib/utils';
import { getBoardThemeIndex } from '../utils/boardTheme';
import { loginPath } from '../utils/authRedirect';
import { openForumPost } from '../utils/openPost';
import { useSiteBranding } from '../hooks/useSiteBranding';
import SiteBrandMark from '../components/SiteBrandMark';
import SiteFooter from '../components/SiteFooter';
import { userPath } from '../utils/userPath';
import { parsePermalinkID } from '../utils/permalink';

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
  const [recentComments, setRecentComments] = useState<RecentComment[]>(() => getCachedRecentComments());
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>(() => getCachedRecentUsers());
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [tags, setTags] = useState<TagCount[]>(() => getCachedTags());
  const [tagsLoading, setTagsLoading] = useState(() => getCachedTags().length === 0);
  const [postOutline, setPostOutline] = useState<{
    headings: PostHeading[];
    scrollRoot: HTMLElement | null;
    title?: string;
    author?: User | null;
    publishedAt?: string;
    viewCount?: number;
  } | null>(null);
  const [asideOpen, setAsideOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [asideLoading, setAsideLoading] = useState(() => !hasCachedAside());
  const [boardsLoading, setBoardsLoading] = useState(() => getCachedBoards().length === 0);
  const asideEverLoaded = useRef(false);
  const [boardId, setBoardId] = useState(() => {
    const m = loc.pathname.match(/^\/board\/(\d+(?:\.[A-Za-z0-9]{1,16})?)$/);
    if (m) return parsePermalinkID(m[1]) || 0;
    return Number(params.get('board')) || 0;
  });
  const [keywordDraft, setKeywordDraft] = useState(params.get('keyword') || '');
  const feedSort = parseFeedSort(params.get('sort'));
  const { limits: forumLimits } = useForumLimits();
  const postSearch = usePostSearch(forumLimits);
  const asideWidgets = useMemo(() => resolveAsideWidgets(forumLimits), [forumLimits]);
  const showTagCloud = asideWidgets.some(w => w.id === 'tag_cloud' && w.enabled);
  const showRecentComments = asideWidgets.some(w => w.id === 'recent_comments' && w.enabled);
  const showRecentUsers = asideWidgets.some(w => w.id === 'recent_users' && w.enabled);

  const asideDrawerRef = useRef<HTMLElement>(null);
  const asideCloseRef = useRef<HTMLButtonElement>(null);
  const sidebarDrawerRef = useRef<HTMLElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const boardBarRef = useRef<HTMLDivElement>(null);

  const closeAside = useCallback(() => setAsideOpen(false), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openAside = useCallback(() => {
    setSidebarOpen(false);
    setAsideOpen(true);
  }, []);
  const openSidebar = useCallback(() => {
    setAsideOpen(false);
    setSidebarOpen(true);
  }, []);

  useOverlayA11y(asideOpen && hideAside && !isCompose, closeAside, asideDrawerRef, {
    initialFocusRef: asideCloseRef,
  });
  useOverlayA11y(sidebarOpen && isMobile && !isCompose, closeSidebar, sidebarDrawerRef, {
    initialFocusRef: sidebarCloseRef,
  });

  useEffect(() => {
    const m = loc.pathname.match(/^\/board\/(\d+(?:\.[A-Za-z0-9]{1,16})?)$/);
    if (m) {
      setBoardId(parsePermalinkID(m[1]) || 0);
      return;
    }
    setBoardId(Number(params.get('board')) || 0);
  }, [loc.pathname, params]);
  useEffect(() => {
    setKeywordDraft(params.get('keyword') || '');
  }, [params]);
  useEffect(() => {
    setAsideOpen(false);
    setSidebarOpen(false);
  }, [loc.pathname, loc.search]);
  useEffect(() => {
    if (!/^\/post\/\d+/.test(loc.pathname)) setPostOutline(null);
  }, [loc.pathname]);
  useEffect(() => {
    if (!hideAside) setAsideOpen(false);
  }, [hideAside]);
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const openSearchPanel = useCallback(() => setSearchPanelOpen(true), []);

  useEffect(() => {
    const onOpen = () => setSearchPanelOpen(true);
    window.addEventListener(POST_SEARCH_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(POST_SEARCH_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (isCompose) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;
      e.preventDefault();
      if (isMobile) {
        setSearchPanelOpen(true);
      } else {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isCompose, isMobile]);
  useEffect(() => {
    if (!asideOpen && !sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [asideOpen, sidebarOpen]);

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

  const refreshUnreadMessages = useCallback(() => {
    if (!user) {
      setUnreadMessages(0);
      return;
    }
    api.messageUnreadCount()
      .then((r) => setUnreadMessages(r.count || 0))
      .catch(() => setUnreadMessages(0));
  }, [user]);

  useEffect(() => {
    refreshUnreadMessages();
    const onRefresh = () => refreshUnreadMessages();
    window.addEventListener('messages-unread-refresh', onRefresh);
    const timer = window.setInterval(refreshUnreadMessages, 60_000);
    return () => {
      window.removeEventListener('messages-unread-refresh', onRefresh);
      window.clearInterval(timer);
    };
  }, [refreshUnreadMessages]);

  // 标签云：进页/离开发帖页时拉取；不跟 posts-refresh 联动（置顶/精华等不改标签）
  useEffect(() => {
    if (isCompose || !showTagCloud) return;
    let cancelled = false;
    if (getCachedTags().length === 0) setTagsLoading(true);
    api.tags(40).then(d => {
      if (cancelled) return;
      const next = Array.isArray(d.tags) ? d.tags : [];
      setTags(next);
      setCachedTags(next);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setTagsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isCompose, showTagCloud]);

  const needAsideData = !isCompose && (!hideAside || asideOpen);
  const needRecentComments = needAsideData && showRecentComments;
  useEffect(() => {
    if (!needRecentComments) return;
    let cancelled = false;
    // 无缓存时才显示加载态，有缓存则静默刷新，避免抽屉高度跳动
    if (!asideEverLoaded.current && !hasCachedAside()) {
      setAsideLoading(true);
    }

    api.recentComments().then(d => {
      if (cancelled) return;
      const next = Array.isArray(d.comments) ? d.comments : [];
      setRecentComments(next);
      setCachedRecentComments(next);
    }).catch(() => {}).finally(() => {
      if (!cancelled) {
        asideEverLoaded.current = true;
        setAsideLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [needRecentComments]);

  const needRecentUsers = needAsideData && showRecentUsers;
  useEffect(() => {
    if (!needRecentUsers) return;
    let cancelled = false;
    if (!asideEverLoaded.current && !hasCachedAside()) {
      setAsideLoading(true);
    }

    api.recentUsers().then(d => {
      if (cancelled) return;
      const next = Array.isArray(d.users) ? d.users : [];
      setRecentUsers(next);
      setCachedRecentUsers(next);
    }).catch(() => {}).finally(() => {
      if (!cancelled) {
        asideEverLoaded.current = true;
        setAsideLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [needRecentUsers]);

  const doQuickSearch = () => {
    const { author, titleOnly, scopeBoardId } = postSearch.filters;
    postSearch.submitSearch({
      keyword: keywordDraft,
      author,
      titleOnly,
      scopeBoardId,
    }, { refreshIfSame: true });
  };

  const handleHeaderClear = () => {
    const hasUrlSearch = postSearch.filters.isFiltered;
    setKeywordDraft('');
    if (hasUrlSearch) postSearch.clearSearch();
  };

  const contextBoard = boards.find((b) => b.id === boardId);
  const searchPanelDraft = {
    keyword: keywordDraft,
    author: postSearch.filters.author,
    titleOnly: postSearch.filters.titleOnly,
    scopeBoardId: postSearch.filters.scopeBoardId,
  };

  const openPost = useCallback((id: number, opts?: { floor?: number }) => {
    setAsideOpen(false);
    openForumPost(nav, id, forumLimits.open_posts_in_new_tab, opts);
  }, [nav, forumLimits.open_posts_in_new_tab]);

  const userInitial = user?.nickname?.charAt(0) || '?';
  const isFeedHome = loc.pathname === '/' || /^\/board\/\d+/.test(loc.pathname);
  const outletKeyword = params.get('keyword') || '';
  const outletTag = params.get('tag') || '';
  const outletAuthor = params.get('author') || '';
  // 搜索/标签结果页不选中任何板块芯片（避免看起来仍停在「全部」）
  const mobileActiveBoard =
    isNeutralSidebarRoute(loc.pathname) || !!outletKeyword || !!outletTag || !!outletAuthor
      ? -1
      : boardId;

  const boardChipIds = useMemo(() => [0, ...boards.map(b => b.id)], [boards]);
  const activeChipIndex = Math.max(0, boardChipIds.indexOf(mobileActiveBoard === -1 ? 0 : mobileActiveBoard));

  const isPostDetail = /^\/post\/\d+/.test(loc.pathname) && !/\/edit$/.test(loc.pathname);
  const setPostOutlineSafe = useCallback((outline: {
    headings: PostHeading[];
    scrollRoot: HTMLElement | null;
    title?: string;
    author?: User | null;
    publishedAt?: string;
    viewCount?: number;
  } | null) => {
    setPostOutline(outline);
  }, []);
  const layoutCtx = useMemo<LayoutCtx>(() => ({
    boardId,
    keyword: outletKeyword,
    setBoardId,
    boards,
    boardsLoading,
    stats,
    refreshBoards,
    isMobile,
    setPostOutline: setPostOutlineSafe,
  }), [boardId, outletKeyword, boards, boardsLoading, stats, refreshBoards, isMobile, setPostOutlineSafe]);

  const selectBoardChip = (id: number) => {
    setBoardId(id);
    navigateFeed(nav, buildHomeUrl(id, feedSort, { permalink: forumLimits }));
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
          {isMobile && !isCompose && (
            <button
              type="button"
              className="header-icon-btn"
              onClick={openSidebar}
              aria-label="打开导航菜单"
              aria-expanded={sidebarOpen}
              aria-controls="sidebar-drawer"
              title="导航"
            >
              <Menu size={18} aria-hidden />
            </button>
          )}
          <button type="button" className="header-brand" onClick={() => navigateFeed(nav, '/')}>
            <SiteBrandMark branding={branding} className="header-logo-mark" />
            {!isMobile && <span className="header-logo-text">{branding.name}</span>}
          </button>

          {!isCompose && isMobile && (
            <button
              type="button"
              className="header-icon-btn header-search-toggle"
              onClick={openSearchPanel}
              aria-label="搜索帖子"
              title="搜索"
            >
              <Search size={18} aria-hidden />
            </button>
          )}

          {!isCompose && !isMobile && (
          <form
            className="header-search-wrap"
            role="search"
            onSubmit={e => {
              e.preventDefault();
              doQuickSearch();
            }}
          >
            <div className="header-search-row">
              <Search className="header-search-icon" size={16} aria-hidden />
              <input
                ref={searchInputRef}
                className="header-search-input"
                type="search"
                placeholder="搜索帖子…"
                aria-label="搜索帖子"
                value={keywordDraft}
                onChange={e => setKeywordDraft(e.target.value)}
                maxLength={forumLimits.search_keyword_max > 0 ? forumLimits.search_keyword_max : undefined}
                enterKeyHint="search"
              />
              <button
                type="button"
                className={cn(
                  'header-search-filter-btn',
                  postSearch.filters.hasAdvancedFilters && 'header-search-filter-btn--active',
                )}
                onClick={openSearchPanel}
                aria-label="搜索筛选"
                title="筛选"
              >
                <SlidersHorizontal size={15} aria-hidden />
                {postSearch.filters.hasAdvancedFilters && (
                  <span className="header-search-filter-btn__dot" aria-hidden />
                )}
              </button>
              {(keywordDraft || postSearch.filters.isFiltered) && (
                <button
                  type="button"
                  className="header-search-clear"
                  onClick={handleHeaderClear}
                  aria-label="清除搜索"
                >×</button>
              )}
              <kbd className="header-search-kbd" aria-hidden>Ctrl K</kbd>
            </div>
          </form>
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
              {/* 平板：侧栏收起时用按钮打开社区动态；手机改由导航抽屉入口 */}
              {!isCompose && hideAside && !isMobile && (
                <button
                  type="button"
                  className="header-icon-btn"
                  onClick={openAside}
                  aria-label={isPostDetail ? '打开作者与目录' : '打开社区动态'}
                  aria-expanded={asideOpen}
                  aria-controls="aside-drawer"
                  title={isPostDetail ? '作者与目录' : '社区动态'}
                >
                  <PanelRight size={18} aria-hidden />
                </button>
              )}

              {!isMobile && (
                <button
                  type="button"
                  className="header-icon-btn"
                  onClick={toggle}
                  aria-label={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
                  title={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
                >
                  {theme === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
                </button>
              )}

              {authLoading ? (
                <span className="header-auth-slot header-auth-slot--loading" aria-hidden />
              ) : user ? (
                <>
                <button
                  type="button"
                  className="header-icon-btn header-msg-btn"
                  title={unreadMessages > 0 ? `${unreadMessages} 条未读消息` : '站内消息'}
                  aria-label={unreadMessages > 0 ? `站内消息，${unreadMessages} 条未读` : '站内消息'}
                  onClick={() => nav('/messages')}
                >
                  <Mail size={18} aria-hidden />
                  {unreadMessages > 0 && (
                    <span className="header-msg-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                  )}
                </button>
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
                    <DropdownMenuItem onClick={() => nav(userPath(user.id))}>个人主页</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => nav('/profile')}>
                      账号设置{typeof user.points === 'number' ? ` · ${user.points} 积分` : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => nav('/messages')}>
                      站内消息{unreadMessages > 0 ? ` (${unreadMessages})` : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => nav('/favorites')}>我的收藏</DropdownMenuItem>
                    {isMobile && (
                      <DropdownMenuItem onClick={toggle}>
                        {theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
                      </DropdownMenuItem>
                    )}
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
                </>
              ) : (
                <button type="button" className="header-login-btn" onClick={() => nav(loginPath())}>
                  登录
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {!isCompose && (
        <PostSearchPanel
          open={searchPanelOpen}
          onOpenChange={setSearchPanelOpen}
          draft={searchPanelDraft}
          contextBoardId={boardId}
          contextBoardName={contextBoard?.name}
          onSubmit={(input) => {
            const ok = postSearch.submitSearch(input);
            if (ok) setKeywordDraft((input.keyword ?? '').trim());
            return ok;
          }}
          onClear={postSearch.clearSearch}
        />
      )}

      <div className={`app-body${isCompose ? ' app-body--compose' : ''}`}>
        {!isCompose && (
          <Sidebar
            boards={boards}
            activeBoard={boardId}
            onSelectBoard={setBoardId}
            boardsLoading={boardsLoading}
          />
        )}

        <div className={cn(
          'content-workspace',
          isCompose && 'content-workspace--compose',
          hideAside && !isCompose && 'content-workspace--aside-hidden',
        )}>
        <main className={cn(
          'main-content',
          isCompose && 'main-content--compose',
          // 手机 Feed：整栏滚动，板块条 / 排序栏可滚出视口，多露出帖子列表
          isMobile && !isCompose && isFeedHome && 'main-content--feed-mobile-scroll',
        )}>
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
            recentComments={recentComments}
            recentUsers={recentUsers}
            tags={tags}
            tagsLoading={tagsLoading}
            stats={stats}
            loading={asideLoading}
            asideWidgets={asideWidgets}
            onPostClick={openPost}
            postDetail={isPostDetail ? {
              author: postOutline?.author ?? null,
              publishedAt: postOutline?.publishedAt,
              viewCount: postOutline?.viewCount,
              headings: postOutline?.headings ?? [],
              scrollRoot: postOutline?.scrollRoot ?? null,
              outlineTitle: postOutline?.title,
            } : null}
          />
        </aside>
        )}
        </div>
      </div>

      {/* 桌面壳层贴底；手机端由各页 InFlowSiteFooter 随内容滚动 */}
      {!isCompose && !isMobile && <SiteFooter />}
      </div>

      {sidebarOpen && isMobile && !isCompose && (
        <div className="sidebar-drawer-root">
          <button
            type="button"
            className="aside-drawer-backdrop"
            aria-label="关闭导航菜单"
            tabIndex={-1}
            onClick={closeSidebar}
          />
          <aside
            id="sidebar-drawer"
            ref={sidebarDrawerRef}
            className="sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
          >
            <div className="aside-drawer-head">
              <span>导航</span>
              <button
                ref={sidebarCloseRef}
                type="button"
                className="header-icon-btn"
                aria-label="关闭"
                onClick={closeSidebar}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="aside-drawer-body sidebar-drawer-body">
              <Sidebar
                boards={boards}
                activeBoard={boardId}
                onSelectBoard={setBoardId}
                boardsLoading={boardsLoading}
              />
              <div className="sidebar-drawer-extras">
                <button
                  type="button"
                  className="sidebar-drawer-extra-btn"
                  onClick={() => { closeSidebar(); openAside(); }}
                >
                  <PanelRight size={16} aria-hidden />
                  {isPostDetail ? '作者与目录' : '社区动态'}
                </button>
                <button
                  type="button"
                  className="sidebar-drawer-extra-btn"
                  onClick={toggle}
                >
                  {theme === 'light' ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
                  {theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

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
            aria-label={isPostDetail ? '作者与目录' : '社区动态'}
          >
            <div className="aside-drawer-head">
              <span>{isPostDetail ? '作者与目录' : '社区动态'}</span>
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
                recentComments={recentComments}
                recentUsers={recentUsers}
                tags={tags}
                tagsLoading={tagsLoading}
                stats={stats}
                loading={asideLoading}
                asideWidgets={asideWidgets}
                onPostClick={openPost}
                postDetail={isPostDetail ? {
                  author: postOutline?.author ?? null,
                  publishedAt: postOutline?.publishedAt,
                  viewCount: postOutline?.viewCount,
                  headings: postOutline?.headings ?? [],
                  scrollRoot: postOutline?.scrollRoot ?? null,
                  outlineTitle: postOutline?.title,
                } : null}
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
  boardsLoading: boolean;
  stats: ForumStats | null;
  refreshBoards: () => void;
  isMobile: boolean;
  /** 详情页上报作者与目录，供右侧栏展示 */
  setPostOutline: (outline: {
    headings: PostHeading[];
    scrollRoot: HTMLElement | null;
    title?: string;
    author?: User | null;
    publishedAt?: string;
    viewCount?: number;
  } | null) => void;
};
