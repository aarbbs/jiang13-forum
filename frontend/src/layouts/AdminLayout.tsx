import { useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, FileText, MessageSquare, Flag, Users, Images, Settings, ArrowLeft, Moon, Sun, Menu, X,
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

const NAV = [
  { to: '/admin/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { to: '/admin/boards', label: '板块管理', icon: FolderKanban },
  { to: '/admin/posts', label: '帖子管理', icon: FileText },
  { to: '/admin/comments', label: '评论管理', icon: MessageSquare },
  { to: '/admin/reports', label: '举报管理', icon: Flag },
  { to: '/admin/users', label: '用户管理', icon: Users },
  { to: '/admin/media', label: '媒体库', icon: Images },
  { to: '/admin/settings', label: '系统设置', icon: Settings },
];

/** React 管理后台布局，与前台 SPA 风格统一 */
export default function AdminLayout() {
  const { user, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const { branding } = useSiteBranding();
  useNoIndexSEO('管理后台');
  const isNarrow = useMediaQuery('(max-width: 768px)');
  const [navOpen, setNavOpen] = useState(false);
  const nav = useNavigate();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeNav = useCallback(() => setNavOpen(false), []);
  useOverlayA11y(isNarrow && navOpen, closeNav, drawerRef, {
    initialFocusRef: closeRef,
  });

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

  const navLinks = NAV.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) => cn('admin-nav-item', isActive && 'active')}
      onClick={closeNav}
    >
      <Icon size={16} aria-hidden />
      {label}
    </NavLink>
  ));

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
          <aside className="admin-sidebar">
            {navLinks}
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
              {navLinks}
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
