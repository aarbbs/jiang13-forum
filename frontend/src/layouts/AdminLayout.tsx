import { useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, FileText, MessageSquare, Flag, Users, Images, Settings, ArrowLeft, Moon, Sun, Menu, X, Award, Link2, BookOpen, Globe2,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '../hooks/useAuth';
import { useTheme, useMediaQuery } from '../hooks/useTheme';
import { useOverlayA11y } from '../hooks/useOverlayA11y';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import BackToTop from '../components/BackToTop';
import { loginPath } from '../utils/authRedirect';
import { useSiteBranding } from '../hooks/useSiteBranding';
import { useNoIndexSEO } from '../hooks/usePageSEO';
import SiteBrandMark from '../components/SiteBrandMark';
import { api } from '../api/client';

type BadgeKey = 'posts' | 'comments' | 'reports' | 'links';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: BadgeKey;
  /** 仅社区枢纽开启时显示 */
  hubOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/** 信息架构：概览 → 内容审核 → 社区 → 系统（2026 管理台常见分层） */
const NAV_GROUPS: NavGroup[] = [
  {
    label: '概览',
    items: [
      { to: '/admin/dashboard', label: '仪表盘', icon: LayoutDashboard },
    ],
  },
  {
    label: '内容审核',
    items: [
      { to: '/admin/posts', label: '帖子管理', icon: FileText, badgeKey: 'posts' },
      { to: '/admin/comments', label: '评论管理', icon: MessageSquare, badgeKey: 'comments' },
      { to: '/admin/reports', label: '举报管理', icon: Flag, badgeKey: 'reports' },
    ],
  },
  {
    label: '社区',
    items: [
      { to: '/admin/boards', label: '板块管理', icon: FolderKanban },
      { to: '/admin/pages', label: '单页管理', icon: BookOpen },
      { to: '/admin/users', label: '用户管理', icon: Users },
      { to: '/admin/badges', label: '徽章管理', icon: Award },
      { to: '/admin/links', label: '友情链接', icon: Link2, badgeKey: 'links' },
      { to: '/admin/community', label: '公网实例', icon: Globe2, hubOnly: true },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/admin/media', label: '媒体库', icon: Images },
      { to: '/admin/settings', label: '系统设置', icon: Settings },
    ],
  },
];

type PendingCounts = {
  posts: number;
  comments: number;
  reports: number;
  links: number;
};

function formatNavBadge(n: number) {
  if (n <= 0) return null;
  return n > 99 ? '99+' : String(n);
}

/** React 管理后台布局，与前台 SPA 风格统一 */
export default function AdminLayout() {
  const { user, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const { branding } = useSiteBranding();
  useNoIndexSEO('管理后台');
  const isNarrow = useMediaQuery('(max-width: 768px)');
  const [navOpen, setNavOpen] = useState(false);
  const [pending, setPending] = useState<PendingCounts>({ posts: 0, comments: 0, reports: 0, links: 0 });
  const [communityHub, setCommunityHub] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeNav = useCallback(() => setNavOpen(false), []);
  useOverlayA11y(isNarrow && navOpen, closeNav, drawerRef, {
    initialFocusRef: closeRef,
  });

  const refreshPending = useCallback(() => {
    api.adminDashboard()
      .then(d => setPending({
        posts: d.pending_posts ?? 0,
        comments: d.pending_comments ?? 0,
        reports: d.pending_reports ?? 0,
        links: d.pending_friend_links ?? 0,
      }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || !user || user.role !== 'admin') return;
    api.adminSettings()
      .then(s => setCommunityHub(!!s.community?.hub_enabled))
      .catch(() => setCommunityHub(false));
  }, [loading, user]);

  useEffect(() => {
    if (loading || !user || user.role !== 'admin') return;
    refreshPending();
    const onRefresh = () => refreshPending();
    window.addEventListener('admin-pending-refresh', onRefresh);
    const timer = window.setInterval(refreshPending, 60_000);
    return () => {
      window.removeEventListener('admin-pending-refresh', onRefresh);
      window.clearInterval(timer);
    };
  }, [loading, user, refreshPending]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav(loginPath('/admin/dashboard'));
      return;
    }
    if (user.role !== 'admin') {
      notify.warning('需要管理员权限');
      nav('/');
    }
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    refreshPending();
  }, [user, location.pathname, refreshPending]);

  useEffect(() => {
    if (!isNarrow) setNavOpen(false);
  }, [isNarrow]);

  useEffect(() => {
    if (!(isNarrow && navOpen)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isNarrow, navOpen]);

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }
  if (!user || user.role !== 'admin') return null;

  const renderNav = () => (
    NAV_GROUPS.map(group => (
      <div key={group.label} className="admin-nav-group">
        <div className="admin-nav-group-label">{group.label}</div>
        {group.items.filter(item => !item.hubOnly || communityHub).map(({ to, label, icon: Icon, badgeKey }) => {
          const badge = badgeKey ? formatNavBadge(pending[badgeKey]) : null;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn('admin-nav-item', isActive && 'active')}
              onClick={closeNav}
            >
              <Icon size={16} aria-hidden className="admin-nav-icon" />
              <span className="admin-nav-text">{label}</span>
              {badge && (
                <span className="admin-nav-badge" aria-label={`${badge} 条待处理`}>
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    ))
  );

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          {isNarrow && (
            <button
              type="button"
              className="header-icon-btn"
              aria-label={navOpen ? '关闭导航' : '打开导航'}
              aria-expanded={navOpen}
              aria-controls="admin-nav-drawer"
              onClick={() => setNavOpen(v => !v)}
            >
              {navOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
            </button>
          )}
          <SiteBrandMark branding={branding} className="admin-topbar-mark" />
          <div>
            <div className="admin-topbar-title">{branding.name}</div>
            <div className="admin-topbar-sub">管理后台</div>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <button
            type="button"
            className="header-icon-btn"
            onClick={toggle}
            aria-label={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
            title={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
          >
            {theme === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
          </button>
          <button type="button" className="admin-link-btn" onClick={() => nav('/')}>
            <ArrowLeft size={16} aria-hidden />
            {!isNarrow && '返回论坛'}
          </button>
          <span className="admin-topbar-user">{user.nickname}</span>
        </div>
      </header>

      <div className="admin-body">
        {!isNarrow && (
          <aside className="admin-sidebar" aria-label="管理导航">
            {renderNav()}
          </aside>
        )}
        <main className="admin-main">
          <Outlet />
        </main>
      </div>

      {isNarrow && navOpen && (
        <div className="admin-nav-drawer-root">
          <button
            type="button"
            className="aside-drawer-backdrop"
            aria-label="关闭导航"
            tabIndex={-1}
            onClick={closeNav}
          />
          <aside
            id="admin-nav-drawer"
            ref={drawerRef}
            className="admin-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="管理导航"
          >
            <div className="admin-nav-drawer-head">
              <span>管理导航</span>
              <button
                ref={closeRef}
                type="button"
                className="header-icon-btn"
                aria-label="关闭"
                onClick={closeNav}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <nav className="admin-nav-drawer-body">
              {renderNav()}
            </nav>
          </aside>
        </div>
      )}

      <BackToTop />
    </div>
  );
}

/** 管理页就绪状态（鉴权由 AdminLayout 负责，此处不再重复跳转） */
export function useAdminGuard() {
  const { user, loading } = useAuth();
  return { user, loading, ready: !loading && !!user && user.role === 'admin' };
}
