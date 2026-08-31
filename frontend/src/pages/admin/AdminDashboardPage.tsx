import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Flag, MessageSquare, Link2, Activity } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { AdminDashboard, AdminDashboardTraffic } from '../../api/types';
import { cn } from '@/lib/utils';
import CommunitySupportStrip from '../../components/admin/CommunitySupportStrip';

function formatDashNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n ?? 0);
}

function pvTrendLabel(today: number, yesterday: number) {
  if (yesterday <= 0) {
    return today > 0 ? '昨日无数据' : '较昨日 —';
  }
  const delta = ((today - yesterday) / yesterday) * 100;
  if (Math.abs(delta) < 0.5) return '与昨日持平';
  const abs = Math.abs(delta).toFixed(0);
  return delta > 0 ? `较昨日 ↑ ${abs}%` : `较昨日 ↓ ${abs}%`;
}

function trendTone(today: number, yesterday: number): 'up' | 'down' | 'flat' {
  if (yesterday <= 0) return 'flat';
  const delta = today - yesterday;
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

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
  const traffic: AdminDashboardTraffic = data.traffic ?? {
    enabled: false, today_pv: 0, today_uv: 0, yesterday_pv: 0, total_pv: 0,
  };

  const queues = [
    {
      key: 'posts',
      label: '待审帖子',
      count: pendingPosts,
      hint: '新帖与修改',
      to: '/admin/posts',
      icon: FileText,
    },
    {
      key: 'comments',
      label: '待审评论',
      count: pendingComments,
      hint: '评论与回复',
      to: '/admin/comments',
      icon: MessageSquare,
    },
    {
      key: 'reports',
      label: '待处理举报',
      count: pendingReports,
      hint: '用户举报',
      to: '/admin/reports',
      icon: Flag,
    },
    {
      key: 'links',
      label: '待审友链',
      count: pendingFriendLinks,
      hint: '友链申请',
      to: '/admin/links',
      icon: Link2,
    },
  ];

  const scale = [
    { label: '注册用户', value: data.users },
    { label: '帖子总数', value: data.posts },
    { label: '板块数量', value: data.boards },
    { label: '评论总数', value: data.comments },
  ];

  const tone = trendTone(traffic.today_pv, traffic.yesterday_pv);

  return (
    <div className="admin-page admin-dash-page">
      <div className="admin-page-head admin-dash-head">
        <div className="admin-dash-head-title">
          <h1>仪表盘</h1>
          {pendingTotal > 0 && (
            <Badge variant="orange">{pendingTotal} 项待处理</Badge>
          )}
        </div>
        <p>处理待办，并一眼看到今日访问</p>
      </div>

      <div className="admin-dash-bento">
        <section className="admin-dash-traffic" aria-label="今日访问">
          <div className="admin-dash-traffic-top">
            <div className="admin-dash-section-label">
              <span className="admin-monitor-section-bar" aria-hidden />
              <h2>今日访问</h2>
            </div>
            <button
              type="button"
              className="admin-text-link admin-dash-link"
              onClick={() => nav('/admin/monitor')}
            >
              <Activity size={14} aria-hidden />
              网站监控 →
            </button>
          </div>

          {!traffic.enabled ? (
            <div className="admin-dash-traffic-empty">
              <p>访问采集尚未开启，流量统计暂不可用。</p>
              <button
                type="button"
                className="admin-text-link"
                onClick={() => nav('/admin/monitor?tab=settings')}
              >
                前往开启 →
              </button>
            </div>
          ) : (
            <>
              <div className="admin-dash-traffic-pv">{formatDashNum(traffic.today_pv)}</div>
              <div className="admin-dash-traffic-meta">
                <span>今日访问 (PV)</span>
                <span className="admin-dash-traffic-uv">今日访客 (UV) {formatDashNum(traffic.today_uv)}</span>
              </div>
              <div className={cn('admin-dash-traffic-trend', `is-${tone}`)}>
                {pvTrendLabel(traffic.today_pv, traffic.yesterday_pv)}
              </div>
              <p className="admin-dash-traffic-total">
                累计访问 {formatDashNum(traffic.total_pv)}
                <span className="admin-dash-traffic-hint">（受日志保留天数影响）</span>
              </p>
            </>
          )}
        </section>

        <section className="admin-dash-queue" aria-label="待处理事项">
          <div className="admin-dash-section-label admin-dash-queue-head">
            <span className="admin-monitor-section-bar" aria-hidden />
            <h2>待处理</h2>
            {pendingTotal === 0 && (
              <span className="admin-section-muted">暂无积压</span>
            )}
          </div>
          <div className="admin-dash-queue-grid">
            {queues.map((q) => {
              const Icon = q.icon;
              const hasWork = q.count > 0;
              return (
                <button
                  key={q.key}
                  type="button"
                  className={cn('admin-dash-queue-card', hasWork && 'has-work')}
                  onClick={() => nav(q.to)}
                >
                  <div className="admin-dash-queue-card-top">
                    <Icon size={16} aria-hidden />
                    <span className="admin-dash-queue-count">{q.count}</span>
                  </div>
                  <div className="admin-dash-queue-label">{q.label}</div>
                  <div className="admin-dash-queue-hint">{q.hint}</div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section className="admin-dash-scale" aria-label="内容规模">
        <div className="admin-dash-section-label">
          <span className="admin-monitor-section-bar" aria-hidden />
          <h2>内容规模</h2>
        </div>
        <div className="admin-dash-metric-grid">
          {scale.map((s) => (
            <div key={s.label} className="admin-dash-metric-card">
              <div className="admin-dash-metric-value">{formatDashNum(s.value)}</div>
              <div className="admin-dash-metric-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <CommunitySupportStrip />

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
            {data.recent_posts.map((p) => (
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
                  {p.featured ? <Badge variant="orange">推荐</Badge> : null}
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
