import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { AdminDashboard } from '../../api/types';

export default function AdminDashboardPage() {
  const nav = useNavigate();
  const { ready } = useAdminGuard();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    api.adminDashboard()
      .then(setData)
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready || loading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }
  if (!data) return null;

  const stats = [
    { label: '注册用户', value: data.users, cls: 'admin-stat-users' },
    { label: '帖子总数', value: data.posts, cls: 'admin-stat-posts' },
    { label: '板块数量', value: data.boards, cls: 'admin-stat-boards' },
    { label: '评论总数', value: data.comments, cls: 'admin-stat-comments' },
  ];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>仪表盘</h1>
        <p>论坛运行概览与最新帖子</p>
      </div>

      <div className="admin-stat-grid">
        {stats.map(s => (
          <div key={s.label} className={`admin-stat-card ${s.cls}`}>
            <div className="admin-stat-value">{s.value}</div>
            <div className="admin-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="admin-card">
        <div className="admin-card-head">
          <span>最新帖子</span>
          <button type="button" className="admin-text-link" onClick={() => nav('/admin/posts')}>
            查看全部 →
          </button>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>作者</th>
              <th>标记</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {data.recent_posts.map(p => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>
                  <button type="button" className="admin-text-link" onClick={() => nav(`/post/${p.id}`)}>
                    {p.title}
                  </button>
                </td>
                <td>
                  {p.user?.id ? (
                    <button type="button" className="admin-text-link" onClick={() => nav(`/user/${p.user!.id}`)}>
                      {p.user.nickname}
                    </button>
                  ) : '—'}
                </td>
                <td className="space-x-1">
                  {p.featured ? <Badge variant="orange">精华</Badge> : null}
                  {p.pinned ? <Badge variant="green">置顶</Badge> : null}
                  {!p.featured && !p.pinned ? '—' : null}
                </td>
                <td>{new Date(p.created_at).toLocaleString('zh-CN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.recent_posts.length === 0 && <div className="admin-empty">暂无帖子</div>}
      </div>
    </div>
  );
}
