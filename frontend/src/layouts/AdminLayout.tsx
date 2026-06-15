import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, FileText, MessageSquare, Users, Settings, ArrowLeft,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '../hooks/useAuth';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/admin/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { to: '/admin/boards', label: '板块管理', icon: FolderKanban },
  { to: '/admin/posts', label: '帖子管理', icon: FileText },
  { to: '/admin/comments', label: '评论管理', icon: MessageSquare },
  { to: '/admin/users', label: '用户管理', icon: Users },
  { to: '/admin/settings', label: '系统设置', icon: Settings },
];

/** React 管理后台布局，与前台 SPA 风格统一 */
export default function AdminLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav('/login');
      return;
    }
    if (user.role !== 'admin') {
      notify.warning('需要管理员权限');
      nav('/');
    }
  }, [user, loading, nav]);

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }
  if (!user || user.role !== 'admin') return null;

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <div className="admin-topbar-mark">姜</div>
          <div>
            <div className="admin-topbar-title">姜十三论坛</div>
            <div className="admin-topbar-sub">管理后台</div>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="admin-link-btn" onClick={() => nav('/')}>
            <ArrowLeft size={16} />
            返回论坛
          </button>
          <span className="admin-topbar-user">{user.nickname}</span>
        </div>
      </header>

      <div className="admin-body">
        <aside className="admin-sidebar">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn('admin-nav-item', isActive && 'active')}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </aside>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** 管理页通用权限守卫 */
export function useAdminGuard() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) nav('/login');
    else if (user.role !== 'admin') {
      notify.warning('需要管理员权限');
      nav('/');
    }
  }, [user, loading, nav]);

  return { user, loading, ready: !loading && !!user && user.role === 'admin' };
}
