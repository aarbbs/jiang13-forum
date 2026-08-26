import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Flag, MessageSquare, Link2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { AdminDashboard } from '../../api/types';
import { cn } from '@/lib/utils';

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

  const pendingPosts = data.pending_posts ?? 0;
  const pendingComments = data.pending_comments ?? 0;
  const pendingReports = data.pending_reports ?? 0;
  const pendingFriendLinks = data.pending_friend_links ?? 0;
  const pendingTotal = pendingPosts + pendingComments + pendingReports + pendingFriendLinks;

  const stats = [
    { label: '注册用户', value: data.users },
    { label: '帖子总数', value: data.posts },
    { label: '板块数量', value: data.boards },
    { label: '评论总数', value: data.comments },
  ];

  const queues = [
    {
      key: 'posts',
      label: '待审帖子',
      count: pendingPosts,
      hint: '新帖与修改待审核',
      to: '/admin/posts',
      icon: FileText,
    },
    {
      key: 'comments',
      label: '待审评论',
      count: pendingComments,
      hint: '评论与回复待审核',
      to: '/admin/comments',
      icon: MessageSquare,
    },
    {
      key: 'reports',
      label: '待处理举报',
      count: pendingReports,
      hint: '用户举报需人工处理',
      to: '/admin/reports',
      icon: Flag,
    },
    {
      key: 'links',
      label: '待审友链',
      count: pendingFriendLinks,
      hint: '用户提交的友情链接申请',
      to: '/admin/links',
      icon: Link2,
    },
  ];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>仪表盘</h1>
        <p>优先处理待办，再查看运行概览</p>
      </div>

      <section className="admin-queue-section" aria-label="待处理事项">
        <div className="admin-section-label">
          <span>待处理</span>
          {pendingTotal > 0 ? (
            <Badge variant="orange">{pendingTotal} 项</Badge>
          ) : (
            <span className="admin-section-muted">暂无积压</span>
          )}
        </div>
        <div className="admin-queue-grid">
          {queues.map(q => {
            const Icon = q.icon;
            const hasWork = q.count > 0;
            return (
              <button
                key={q.key}
                type="button"
                className={cn('admin-queue-card', hasWork && 'has-work')}
                onClick={() => nav(q.to)}
              >
                <div className="admin-queue-card-top">
                  <Icon size={18} aria-hidden />
                  <span className="admin-queue-count">{q.count}</span>
                </div>
                <div className="admin-queue-label">{q.label}</div>
                <div className="admin-queue-hint">{q.hint}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="admin-stat-section" aria-label="运行概览">
        <div className="admin-section-label">
          <span>运行概览</span>
        </div>
        <div className="admin-stat-grid">
          {stats.map(s => (
            <div key={s.label} className="admin-stat-card">
              <div className="admin-stat-value">{s.value}</div>
              <div className="admin-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

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
                  {p.pinned ? <Badge variant="green">全局置顶</Badge> : null}
                  {p.board_pinned ? <Badge variant="green">板块置顶</Badge> : null}
                  {!p.featured && !p.pinned && !p.board_pinned ? '—' : null}
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
