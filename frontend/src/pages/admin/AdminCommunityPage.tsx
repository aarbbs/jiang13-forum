import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe2, ExternalLink, Star } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { api } from '../../api/client';
import type { CommunityInstance, ForumLimits } from '../../api/types';
import { useAdminGuard } from '../../layouts/AdminLayout';
import { formatTime } from '../../utils/content';
import { invalidateForumLimitsCache } from '../../hooks/useForumLimits';
import {
  mergeForumLimitsWithAsideWidgets,
  normalizeAsideWidgets,
  resolveAsideWidgets,
} from '../../utils/asideWidgets';

type EntryFlags = {
  nav: boolean;
  footer: boolean;
  aside: boolean;
};

/** 后台：公网实例列表 + 开源展柜入口位置 */
export default function AdminCommunityPage() {
  const { ready } = useAdminGuard();
  const [hubEnabled, setHubEnabled] = useState(false);
  const [list, setList] = useState<CommunityInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [featuringId, setFeaturingId] = useState<string | null>(null);
  const [forumLimits, setForumLimits] = useState<ForumLimits | null>(null);
  const [entrySaving, setEntrySaving] = useState(false);

  const entryFlags = useMemo<EntryFlags>(() => {
    const widgets = resolveAsideWidgets({
      aside_widgets: forumLimits?.aside_widgets,
      aside_show_tag_cloud: forumLimits?.aside_show_tag_cloud ?? false,
      aside_show_recent_comments: forumLimits?.aside_show_recent_comments ?? false,
      aside_show_friend_links: forumLimits?.aside_show_friend_links ?? true,
      aside_show_showcase: forumLimits?.aside_show_showcase ?? false,
    });
    return {
      nav: !!forumLimits?.nav_show_showcase,
      footer: !!forumLimits?.footer_show_showcase,
      aside: widgets.find(w => w.id === 'showcase')?.enabled ?? false,
    };
  }, [forumLimits]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    Promise.all([
      api.adminCommunityInstances(),
      api.adminSettings().catch(() => null),
    ])
      .then(([instancesRes, settings]) => {
        setHubEnabled(!!instancesRes.hub_enabled);
        setList(Array.isArray(instancesRes.instances) ? instancesRes.instances : []);
        if (settings?.limits) {
          const loaded = normalizeAsideWidgets(
            resolveAsideWidgets({
              aside_widgets: settings.limits.aside_widgets,
              aside_show_tag_cloud: settings.limits.aside_show_tag_cloud ?? false,
              aside_show_recent_comments: settings.limits.aside_show_recent_comments ?? false,
              aside_show_friend_links: settings.limits.aside_show_friend_links ?? true,
              aside_show_showcase: settings.limits.aside_show_showcase ?? false,
            }),
          );
          setForumLimits(mergeForumLimitsWithAsideWidgets({
            ...settings.limits,
            nav_show_showcase: !!settings.limits.nav_show_showcase,
            footer_show_showcase: !!settings.limits.footer_show_showcase,
            aside_show_showcase: !!settings.limits.aside_show_showcase,
          }, loaded));
        }
      })
      .catch(() => {
        setList([]);
      })
      .finally(() => setLoading(false));
  }, [ready]);

  const patchEntryVisibility = async (patch: Partial<EntryFlags>) => {
    if (entrySaving) return;
    const prev = entryFlags;
    const nextFlags = { ...prev, ...patch };
    setForumLimits((fl) => {
      if (!fl) return fl;
      const widgets = normalizeAsideWidgets(fl.aside_widgets).map(w => (
        w.id === 'showcase' ? { ...w, enabled: nextFlags.aside } : w
      ));
      return mergeForumLimitsWithAsideWidgets({
        ...fl,
        nav_show_showcase: nextFlags.nav,
        footer_show_showcase: nextFlags.footer,
        aside_show_showcase: nextFlags.aside,
      }, widgets);
    });
    setEntrySaving(true);
    try {
      const body: {
        nav_show_showcase?: boolean;
        footer_show_showcase?: boolean;
        aside_show_showcase?: boolean;
      } = {};
      if (patch.nav !== undefined) body.nav_show_showcase = patch.nav;
      if (patch.footer !== undefined) body.footer_show_showcase = patch.footer;
      if (patch.aside !== undefined) body.aside_show_showcase = patch.aside;
      const r = await api.adminUpdateShowcaseEntry(body);
      setForumLimits((base) => {
        if (!base) return base;
        const widgets = normalizeAsideWidgets(base.aside_widgets).map(w => (
          w.id === 'showcase' ? { ...w, enabled: r.aside_show_showcase } : w
        ));
        return mergeForumLimitsWithAsideWidgets({
          ...base,
          nav_show_showcase: r.nav_show_showcase,
          footer_show_showcase: r.footer_show_showcase,
          aside_show_showcase: r.aside_show_showcase,
        }, widgets);
      });
      invalidateForumLimitsCache();
      notify.success(r.message);
    } catch (e: unknown) {
      setForumLimits((fl) => {
        if (!fl) return fl;
        const widgets = normalizeAsideWidgets(fl.aside_widgets).map(w => (
          w.id === 'showcase' ? { ...w, enabled: prev.aside } : w
        ));
        return mergeForumLimitsWithAsideWidgets({
          ...fl,
          nav_show_showcase: prev.nav,
          footer_show_showcase: prev.footer,
          aside_show_showcase: prev.aside,
        }, widgets);
      });
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setEntrySaving(false);
    }
  };

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
            <Link to="/showcase" className="admin-inline-link" target="_blank" rel="noopener noreferrer">开源部署展柜</Link>
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

      {hubEnabled && (
        <div className="admin-card admin-links-entry-card" style={{ marginBottom: 16 }}>
          <div className="admin-card-head">展柜入口</div>
          <p className="admin-card-desc">
            控制「开源展柜」出现在何处；关闭后仍可直接访问 /showcase。右侧栏开关与「系统设置 → 右侧栏组件」同源。
          </p>
          <div className="admin-card-body admin-links-entry-body">
            {(
              [
                { key: 'nav' as const, label: '左侧栏（站点）', on: entryFlags.nav },
                { key: 'aside' as const, label: '右侧栏', on: entryFlags.aside },
                { key: 'footer' as const, label: '页脚', on: entryFlags.footer },
              ]
            ).map(item => (
              <div key={item.key} className="admin-links-entry-row">
                <span id={`admin-showcase-entry-${item.key}`}>{item.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.on}
                  aria-labelledby={`admin-showcase-entry-${item.key}`}
                  disabled={entrySaving}
                  className={cn('admin-settings-switch', item.on && 'is-on')}
                  onClick={() => void patchEntryVisibility({ [item.key]: !item.on })}
                >
                  <span className="admin-settings-switch-ui" aria-hidden />
                </button>
              </div>
            ))}
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
