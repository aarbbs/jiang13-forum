import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe2, ExternalLink, Star } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import type { CommunityInstance } from '../../api/types';
import { useAdminGuard } from '../../layouts/AdminLayout';
import { formatTime } from '../../utils/content';
import { cn } from '@/lib/utils';

export default function AdminCommunityPage() {
  const { ready } = useAdminGuard();
  const [hubEnabled, setHubEnabled] = useState(false);
  const [list, setList] = useState<CommunityInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [featuringId, setFeaturingId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    api.adminCommunityInstances()
      .then((r) => {
        setHubEnabled(!!r.hub_enabled);
        setList(Array.isArray(r.instances) ? r.instances : []);
      })
      .catch(() => {
        setList([]);
      })
      .finally(() => setLoading(false));
  }, [ready]);

  const handleToggleFeatured = async (row: CommunityInstance) => {
    if (featuringId) return;
    setFeaturingId(row.instance_id);
    try {
      const r = await api.adminFeatureCommunityInstance(row.instance_id, {
        featured: !row.featured,
        featured_note: row.featured_note || '',
      });
      setList((prev) => prev.map((item) => (
        item.instance_id === row.instance_id ? { ...item, ...r.instance } : item
      )));
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setFeaturingId(null);
    }
  };

  if (!ready || loading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">
            <Globe2 size={22} aria-hidden />
            公网实例
          </h1>
          <p className="admin-page-desc">
            接收自愿上报的心跳；设为精选后会出现在
            {' '}
            <Link to="/showcase" className="admin-inline-link" target="_blank" rel="noopener noreferrer">公开展柜</Link>
          </p>
        </div>
      </div>

      {!hubEnabled && (
        <div className="admin-card admin-settings-card" style={{ marginBottom: 16 }}>
          <div className="admin-card-body">
            <p>
              本站未开启社区枢纽。该能力仅供官方主站运维配置开启（
              <code>app.ini</code> 的 <code>[community] hub = true</code>
              {' '}或环境变量 <code>JIANG13_COMMUNITY_HUB=1</code>
              ），普通部署无需也无法在后台打开。
            </p>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-head">
          <span>实例列表</span>
          <span className="admin-settings-card-badge">{list.length} 个</span>
        </div>
        <div className="admin-card-body" style={{ padding: 0 }}>
          {list.length === 0 ? (
            <p className="admin-empty" style={{ padding: 24 }}>暂无上报记录</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>站点</th>
                    <th>版本</th>
                    <th>用户</th>
                    <th>帖子</th>
                    <th>最近心跳</th>
                    <th>精选</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.instance_id}>
                      <td>
                        <Badge variant={row.online ? 'default' : 'secondary'}>
                          {row.online ? '在线' : '离线'}
                        </Badge>
                      </td>
                      <td>
                        <div className="admin-community-site">
                          <strong>
                            {row.featured && <Star size={12} className="admin-community-star" aria-hidden />}
                            {row.site_name || '未命名站点'}
                          </strong>
                          <a
                            href={row.site_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn('admin-inline-link', 'admin-community-url')}
                          >
                            {row.site_url}
                            <ExternalLink size={12} aria-hidden />
                          </a>
                        </div>
                      </td>
                      <td><code>{row.version || '—'}</code></td>
                      <td>{row.users}</td>
                      <td>{row.posts}</td>
                      <td title={row.last_seen_at}>{formatTime(row.last_seen_at)}</td>
                      <td>
                        <Button
                          variant="outline"
                          size="sm"
                          loading={featuringId === row.instance_id}
                          disabled={!!featuringId}
                          onClick={() => void handleToggleFeatured(row)}
                        >
                          {row.featured ? '取消精选' : '精选'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
