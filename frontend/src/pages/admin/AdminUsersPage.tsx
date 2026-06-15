import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { User } from '../../api/types';

export default function AdminUsersPage() {
  const { ready } = useAdminGuard();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = (p = page) => {
    setLoading(true);
    api.adminUsers(p)
      .then(d => {
        setUsers(d.users ?? []);
        setPage(d.page);
        setTotalPages(d.total_pages);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (ready) load(1);
  }, [ready]);

  const toggleBan = async (user: User) => {
    if (user.role === 'admin') {
      notify.warning('不能禁言管理员');
      return;
    }
    try {
      const r = await api.adminBanUser(user.id, !user.banned);
      notify.success(r.message);
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  if (!ready) return null;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>用户管理</h1>
        <p>查看注册用户，禁言或解除禁言</p>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>用户名</th>
                  <th>昵称</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>注册时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.nickname}</td>
                    <td>
                      {u.role === 'admin'
                        ? <Badge variant="orange">管理员</Badge>
                        : <Badge variant="secondary">用户</Badge>}
                    </td>
                    <td>{u.banned ? <Badge variant="destructive">已禁言</Badge> : '正常'}</td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : '—'}</td>
                    <td>
                      {u.role !== 'admin' && (
                        <Button size="sm" variant="outline" onClick={() => toggleBan(u)}>
                          {u.banned ? '解除禁言' : '禁言'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <div className="admin-empty">暂无用户</div>}
            {totalPages > 1 && (
              <div className="admin-pagination">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
                <span>第 {page} / {totalPages} 页</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>下一页</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
