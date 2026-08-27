import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Link2, Plus, Trash2, Check, X, ExternalLink, Eye, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { ForumLimits, FriendLink, FriendLinkApply, SiteBranding } from '../../api/types';
import { useSiteBranding, seedSiteBrandingCache, invalidateSiteBrandingCache } from '../../hooks/useSiteBranding';
import { invalidateForumLimitsCache } from '../../hooks/useForumLimits';
import { formatTime } from '../../utils/content';
import { resolveFriendLinkLogo, isReciprocalChecking, reciprocalStatusLabel } from '../../utils/friendLink';
import {
  mergeForumLimitsWithAsideWidgets,
  normalizeAsideWidgets,
  resolveAsideWidgets,
} from '../../utils/asideWidgets';
import AdminSortableList, { SortableDragHandle, SortableMoveButtons } from '../../components/admin/AdminSortableList';
import { shouldShowSortableMoveButtons } from '../../utils/sortOrder';

type ApplyStatusTab = 'pending' | 'approved' | 'rejected' | 'all';

type LinkRow = FriendLink & { _key: string };

const APPLY_PAGE_SIZE = 20;

function applyStatusBadge(status: FriendLinkApply['status']) {
  switch (status) {
    case 'pending':
      return <Badge variant="orange">待审核</Badge>;
    case 'approved':
      return <Badge variant="green">已通过</Badge>;
    case 'rejected':
      return <Badge variant="secondary">已拒绝</Badge>;
    default:
      return null;
  }
}

function linkInitial(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

function normalizeLinks(list: FriendLink[]): FriendLink[] {
  return list
    .map(l => ({
      name: l.name.trim(),
      url: l.url.trim(),
      logo: l.logo?.trim() || '',
    }))
    .filter(l => l.name && l.url);
}

function linksEqual(a: FriendLink[], b: FriendLink[]): boolean {
  return JSON.stringify(normalizeLinks(a)) === JSON.stringify(normalizeLinks(b));
}

function toLinkRows(list: FriendLink[]): LinkRow[] {
  return list.map((l, i) => ({
    ...l,
    _key: `${l.url}-${l.name}-${i}`,
  }));
}

function ApplyLogo({ apply, className, siteURL }: { apply: FriendLinkApply; className?: string; siteURL?: string }) {
  const logo = resolveFriendLinkLogo(apply.logo, siteURL);
  if (logo) {
    return (
      <div className={cn('admin-links-logo-thumb', className)}>
        <img src={logo} alt="" loading="lazy" decoding="async" />
      </div>
    );
  }
  return (
    <div className={cn('admin-links-logo-thumb admin-links-logo-thumb--placeholder', className)}>
      {linkInitial(apply.name)}
    </div>
  );
}

function ReciprocalAddress({ apply }: { apply: FriendLinkApply }) {
  const href = apply.reciprocal_page_url?.trim();
  if (!href) {
    return <span className="admin-links-reciprocal-empty">未填写</span>;
  }
  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer">{href}</a>
      {apply.link_on_homepage ? '（首页）' : ''}
    </>
  );
}

/** 后台：友情链接独立管理 */
export default function AdminLinksPage() {
  const nav = useNavigate();
  const { ready } = useAdminGuard();
  const { branding } = useSiteBranding();
  const rowKeyRef = useRef(0);

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [applyStatus, setApplyStatus] = useState<ApplyStatusTab>('pending');
  const [applies, setApplies] = useState<FriendLinkApply[]>([]);
  const [applyPage, setApplyPage] = useState(1);
  const [applyTotal, setApplyTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [appliesLoading, setAppliesLoading] = useState(true);

  const [detailApply, setDetailApply] = useState<FriendLinkApply | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FriendLinkApply | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [handlingId, setHandlingId] = useState<number | null>(null);
  const [reciprocalCheckEnabled, setReciprocalCheckEnabled] = useState(false);
  const [reciprocalCheckSaving, setReciprocalCheckSaving] = useState(false);
  const [forumLimits, setForumLimits] = useState<ForumLimits | null>(null);
  const [entrySaving, setEntrySaving] = useState(false);

  const baselineLinks = branding.friend_links ?? [];
  const siteURL = branding.site_url;
  const isDirty = useMemo(
    () => !linksEqual(links, baselineLinks),
    [links, baselineLinks],
  );

  const entryFlags = useMemo(() => {
    const widgets = resolveAsideWidgets({
      aside_widgets: forumLimits?.aside_widgets,
      aside_show_tag_cloud: forumLimits?.aside_show_tag_cloud ?? false,
      aside_show_recent_comments: forumLimits?.aside_show_recent_comments ?? false,
      aside_show_friend_links: forumLimits?.aside_show_friend_links ?? true,
    });
    return {
      nav: forumLimits?.nav_show_friend_links !== false,
      footer: forumLimits?.footer_show_friend_links !== false,
      aside: widgets.find(w => w.id === 'friend_links')?.enabled ?? true,
    };
  }, [forumLimits]);

  useEffect(() => {
    setLinks(toLinkRows(baselineLinks));
  }, [baselineLinks]);

  useEffect(() => {
    if (!ready) return;
    api.adminSettings()
      .then(s => {
        const loadedAsideWidgets = normalizeAsideWidgets(
          resolveAsideWidgets({
            aside_widgets: s.limits?.aside_widgets,
            aside_show_tag_cloud: s.limits?.aside_show_tag_cloud ?? false,
            aside_show_recent_comments: s.limits?.aside_show_recent_comments ?? false,
            aside_show_friend_links: s.limits?.aside_show_friend_links ?? true,
          }),
        );
        const base: ForumLimits = {
          open_posts_in_new_tab: true,
          open_content_links_in_new_tab: true,
          aside_show_tag_cloud: false,
          aside_show_recent_comments: false,
          aside_show_friend_links: true,
          aside_widgets: loadedAsideWidgets,
          nav_show_friend_links: true,
          footer_show_friend_links: true,
          feed_list_style: 'title',
          permalink_enabled: false,
          permalink_ext: 'html',
          ...s.limits,
        };
        setForumLimits(mergeForumLimitsWithAsideWidgets(base, loadedAsideWidgets));
      })
      .catch(() => { /* 入口开关稍后仍可按默认展示 */ });
  }, [ready]);

  const loadApplies = useCallback(async (status: ApplyStatusTab = applyStatus, page = 1) => {
    setAppliesLoading(true);
    try {
      const r = await api.adminFriendLinkApplies({ status, page, size: APPLY_PAGE_SIZE });
      setApplies(r.applies ?? []);
      setApplyTotal(r.total ?? 0);
      setApplyPage(r.page ?? page);
      setPendingCount(r.pending_count ?? 0);
      setReciprocalCheckEnabled(!!r.reciprocal_check_enabled);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setAppliesLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    if (ready) loadApplies(applyStatus, 1);
  }, [ready, applyStatus, loadApplies]);

  useEffect(() => {
    if (!ready || !reciprocalCheckEnabled || !applies.some(isReciprocalChecking)) return;
    const timer = window.setInterval(() => loadApplies(applyStatus, applyPage), 3000);
    return () => window.clearInterval(timer);
  }, [ready, applies, applyStatus, applyPage, loadApplies, reciprocalCheckEnabled]);

  useEffect(() => {
    if (!detailApply) return;
    const updated = applies.find(a => a.id === detailApply.id);
    if (updated) setDetailApply(updated);
  }, [applies, detailApply]);

  const applyTabs: { key: ApplyStatusTab; label: string }[] = [
    { key: 'pending', label: `待审${pendingCount ? ` (${pendingCount})` : ''}` },
    { key: 'approved', label: '已通过' },
    { key: 'rejected', label: '已拒绝' },
    { key: 'all', label: '全部' },
  ];

  const applyTotalPages = Math.max(1, Math.ceil(applyTotal / APPLY_PAGE_SIZE));
  const showMoveButtons = shouldShowSortableMoveButtons(links.length);

  const addLinkRow = () => {
    rowKeyRef.current += 1;
    setLinks(prev => [...prev, { name: '', url: '', logo: '', _key: `new-${rowKeyRef.current}` }]);
  };

  const resetLinks = () => {
    setLinks(toLinkRows(baselineLinks));
    notify.success('已恢复为已保存的版本');
  };

  const save = async () => {
    const cleaned = normalizeLinks(links);
    const urls = new Set<string>();
    for (const l of cleaned) {
      if (!/^https?:\/\//i.test(l.url)) {
        notify.warning('友情链接需完整 http/https URL');
        return;
      }
      const key = l.url.toLowerCase();
      if (urls.has(key)) {
        notify.warning(`存在重复 URL：${l.url}`);
        return;
      }
      urls.add(key);
    }
    setSaving(true);
    try {
      const payload: SiteBranding = { ...branding, friend_links: cleaned };
      const r = await api.adminUpdateBranding(payload);
      seedSiteBrandingCache({ ...branding, ...r.branding, friend_links: cleaned });
      setLinks(toLinkRows(cleaned));
      notify.success('友情链接已保存');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const approveApply = async (apply: FriendLinkApply) => {
    setHandlingId(apply.id);
    try {
      const r = await api.adminApproveFriendLinkApply(apply.id);
      invalidateSiteBrandingCache();
      notify.success(r.message);
      setDetailApply(null);
      loadApplies(applyStatus, applyPage);
      window.dispatchEvent(new Event('admin-pending-refresh'));
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setHandlingId(null);
    }
  };

  const openReject = (apply: FriendLinkApply) => {
    setDetailApply(null);
    setRejectTarget(apply);
    setRejectNote('');
  };

  const recheckReciprocal = async (apply: FriendLinkApply) => {
    setHandlingId(apply.id);
    try {
      const r = await api.adminRecheckFriendLinkApply(apply.id);
      notify.success(r.message);
      setDetailApply(r.apply);
      loadApplies(applyStatus, applyPage);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setHandlingId(null);
    }
  };

  const toggleReciprocalCheck = async () => {
    if (reciprocalCheckSaving) return;
    const next = !reciprocalCheckEnabled;
    setReciprocalCheckEnabled(next);
    setReciprocalCheckSaving(true);
    try {
      const r = await api.adminUpdateFriendLinkSettings({ reciprocal_check_enabled: next });
      setReciprocalCheckEnabled(r.reciprocal_check_enabled);
      notify.success(r.message);
    } catch (e: unknown) {
      setReciprocalCheckEnabled(!next);
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setReciprocalCheckSaving(false);
    }
  };

  const patchEntryVisibility = async (patch: {
    nav?: boolean;
    footer?: boolean;
    aside?: boolean;
  }) => {
    if (entrySaving) return;
    const prev = {
      nav: entryFlags.nav,
      footer: entryFlags.footer,
      aside: entryFlags.aside,
    };
    const nextFlags = {
      nav: patch.nav ?? prev.nav,
      footer: patch.footer ?? prev.footer,
      aside: patch.aside ?? prev.aside,
    };
    // 乐观更新本地 limits，避免开关回弹
    setForumLimits(fl => {
      if (!fl) {
        return {
          open_posts_in_new_tab: true,
          open_content_links_in_new_tab: true,
          aside_show_tag_cloud: false,
          aside_show_recent_comments: false,
          aside_show_friend_links: nextFlags.aside,
          aside_widgets: normalizeAsideWidgets([
            { id: 'tag_cloud', enabled: false },
            { id: 'recent_comments', enabled: false },
            { id: 'recent_users', enabled: false },
            { id: 'friend_links', enabled: nextFlags.aside },
          ]),
          nav_show_friend_links: nextFlags.nav,
          footer_show_friend_links: nextFlags.footer,
          feed_list_style: 'title',
          permalink_enabled: false,
          permalink_ext: 'html',
          post_edit_window_hours: 24,
          comment_edit_window_minutes: 3,
          rate_limit_post: 10,
          rate_limit_comment: 10,
          rate_limit_register: 10,
          rate_limit_login: 10,
          rate_limit_window_sec: 60,
          post_title_max: 128,
          post_tags_max: 256,
          post_content_max: 50000,
          comment_max: 5000,
          search_keyword_min: 1,
          search_keyword_max: 50,
          page_size_default: 30,
          password_min_len: 6,
          avatar_max_mb: 2,
          signature_max: 200,
        };
      }
      const widgets = normalizeAsideWidgets(fl.aside_widgets).map(w => (
        w.id === 'friend_links' ? { ...w, enabled: nextFlags.aside } : w
      ));
      return mergeForumLimitsWithAsideWidgets({
        ...fl,
        nav_show_friend_links: nextFlags.nav,
        footer_show_friend_links: nextFlags.footer,
      }, widgets);
    });
    setEntrySaving(true);
    try {
      const body: {
        nav_show_friend_links?: boolean;
        footer_show_friend_links?: boolean;
        aside_show_friend_links?: boolean;
      } = {};
      if (patch.nav !== undefined) body.nav_show_friend_links = patch.nav;
      if (patch.footer !== undefined) body.footer_show_friend_links = patch.footer;
      if (patch.aside !== undefined) body.aside_show_friend_links = patch.aside;
      const r = await api.adminUpdateFriendLinkSettings(body);
      setForumLimits(fl => {
        const base = fl;
        if (!base) return fl;
        const widgets = normalizeAsideWidgets(base.aside_widgets).map(w => (
          w.id === 'friend_links' ? { ...w, enabled: r.aside_show_friend_links } : w
        ));
        return mergeForumLimitsWithAsideWidgets({
          ...base,
          nav_show_friend_links: r.nav_show_friend_links,
          footer_show_friend_links: r.footer_show_friend_links,
          aside_show_friend_links: r.aside_show_friend_links,
        }, widgets);
      });
      invalidateForumLimitsCache();
      notify.success(r.message);
    } catch (e: unknown) {
      setForumLimits(fl => {
        if (!fl) return fl;
        const widgets = normalizeAsideWidgets(fl.aside_widgets).map(w => (
          w.id === 'friend_links' ? { ...w, enabled: prev.aside } : w
        ));
        return mergeForumLimitsWithAsideWidgets({
          ...fl,
          nav_show_friend_links: prev.nav,
          footer_show_friend_links: prev.footer,
        }, widgets);
      });
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setEntrySaving(false);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      const r = await api.adminRejectFriendLinkApply(rejectTarget.id, { note: rejectNote.trim() });
      notify.success(r.message);
      setRejectTarget(null);
      setRejectNote('');
      loadApplies(applyStatus, applyPage);
      window.dispatchEvent(new Event('admin-pending-refresh'));
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setRejecting(false);
    }
  };

  const renderApplicant = (apply: FriendLinkApply) => {
    const label = apply.user?.nickname || apply.user?.username || `用户 #${apply.user_id}`;
    if (apply.user_id) {
      return (
        <button type="button" className="admin-text-link" onClick={() => nav(`/user/${apply.user_id}`)}>
          {label}
        </button>
      );
    }
    return label;
  };

  const renderPendingCard = (apply: FriendLinkApply) => {
    const reciprocal = reciprocalStatusLabel(apply);
    return (
      <div
        key={apply.id}
        className={cn(
          'admin-links-pending-row',
          reciprocalCheckEnabled && !isReciprocalChecking(apply) && !apply.reciprocal_verified && 'admin-links-pending-row--warn',
        )}
      >
        <ApplyLogo apply={apply} className="admin-links-pending-logo" siteURL={siteURL} />
        <div className="admin-links-pending-main">
          <div className="admin-links-pending-title">
            <strong>{apply.name}</strong>
            <a href={apply.url} target="_blank" rel="noopener noreferrer">{apply.url}</a>
          </div>
          <p className="admin-links-pending-reciprocal">
            回链地址：
            <ReciprocalAddress apply={apply} />
          </p>
          <p className="admin-links-pending-meta">
            <Badge variant={reciprocal.variant}>{reciprocal.text}</Badge>
            {' · '}
            {renderApplicant(apply)}
            {' · '}
            {formatTime(apply.created_at)}
          </p>
        </div>
        <div className="admin-links-pending-actions">
          <Button type="button" size="sm" variant="outline" onClick={() => setDetailApply(apply)}>
            <Eye size={14} aria-hidden /> 查看
          </Button>
        </div>
      </div>
    );
  };

  const renderApplyTable = () => (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>站点</th>
            <th>申请人</th>
            <th>回链地址</th>
            <th>回链检测</th>
            <th>状态</th>
            <th>时间</th>
            {applyStatus === 'rejected' || applyStatus === 'all' ? <th>备注</th> : null}
          </tr>
        </thead>
        <tbody>
          {applies.map(apply => {
            const reciprocal = reciprocalStatusLabel(apply);
            return (
              <tr key={apply.id}>
                <td>{apply.id}</td>
                <td className="admin-links-table-site">
                  <div className="admin-links-table-site__head">
                    <ApplyLogo apply={apply} siteURL={siteURL} />
                    <div>
                      <strong>{apply.name}</strong>
                      <a href={apply.url} target="_blank" rel="noopener noreferrer">{apply.url}</a>
                    </div>
                  </div>
                </td>
                <td>{renderApplicant(apply)}</td>
                <td className="admin-links-table-reciprocal"><ReciprocalAddress apply={apply} /></td>
                <td><Badge variant={reciprocal.variant}>{reciprocal.text}</Badge></td>
                <td>{applyStatusBadge(apply.status)}</td>
                <td className="text-sm whitespace-nowrap">{formatTime(apply.created_at)}</td>
                {(applyStatus === 'rejected' || applyStatus === 'all') && (
                  <td className="text-sm text-muted-foreground max-w-[200px]">
                    {apply.review_note?.trim() || '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (!ready) return null;

  return (
    <div className="admin-page admin-links-page">
      <header className="admin-page-head admin-links-page-head">
        <div>
          <h1><Link2 size={20} aria-hidden /> 友情链接</h1>
          <p>管理已发布友链（最多 20 条）并审核用户申请；通过后将展示在友情链接页面</p>
        </div>
        <div className="admin-links-page-head__actions">
          <Button type="button" variant="outline" asChild>
            <Link to="/links" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden />
              预览友链页
            </Link>
          </Button>
          <Button
            type="button"
            disabled={saving || !isDirty}
            onClick={save}
          >
            {saving ? '保存中…' : isDirty ? '保存友链' : '已是最新'}
          </Button>
        </div>
      </header>

      <div className="admin-card admin-links-entry-card">
        <div className="admin-card-head">入口展示</div>
        <p className="admin-card-desc">
          控制友情链接入口出现在何处；关闭后仍可直接访问 /links 页面申请与浏览。右侧栏开关与「系统设置 → 右侧栏组件」同源。
        </p>
        <div className="admin-card-body admin-links-entry-body">
          {(
            [
              { key: 'nav' as const, label: '左侧栏（站点）', on: entryFlags.nav },
              { key: 'footer' as const, label: '页脚', on: entryFlags.footer },
              { key: 'aside' as const, label: '右侧栏', on: entryFlags.aside },
            ]
          ).map(item => (
            <div key={item.key} className="admin-links-entry-row">
              <span id={`admin-links-entry-${item.key}`}>{item.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={item.on}
                aria-labelledby={`admin-links-entry-${item.key}`}
                disabled={entrySaving}
                className={cn('admin-settings-switch', item.on && 'is-on')}
                onClick={() => patchEntryVisibility({ [item.key]: !item.on })}
              >
                <span className="admin-settings-switch-ui" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-links-columns">
      <div className="admin-card admin-links-apply-card">
        <div className="admin-card-head">
          <div className="admin-links-apply-head">
            <span>申请审核</span>
            {pendingCount > 0 && <Badge variant="orange">{pendingCount}</Badge>}
          </div>
          <div className="admin-links-reciprocal-toggle">
            <span id="admin-links-reciprocal-label">回链检测</span>
            <button
              type="button"
              id="admin-links-reciprocal-switch"
              role="switch"
              aria-checked={reciprocalCheckEnabled}
              aria-labelledby="admin-links-reciprocal-label"
              disabled={reciprocalCheckSaving}
              className={cn('admin-settings-switch', reciprocalCheckEnabled && 'is-on')}
              onClick={toggleReciprocalCheck}
            >
              <span className="admin-settings-switch-ui" aria-hidden />
            </button>
          </div>
        </div>
        <p className="admin-card-desc">
          {reciprocalCheckEnabled
            ? '回链检测结果仅供参考，未检测到回链仍可手动通过。'
            : '回链检测已关闭，申请仍可手动审核通过。'}
        </p>
        <div className="admin-card-body admin-links-apply-body">
          <div className="admin-tabs">
            {applyTabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                className={cn('admin-tab', applyStatus === tab.key && 'active')}
                onClick={() => {
                  setApplyStatus(tab.key);
                  setApplyPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="admin-links-apply-scroll">
          {appliesLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : applies.length === 0 ? (
            <p className="admin-table-empty">
              {applyStatus === 'pending' ? '暂无待审申请' : '暂无记录'}
            </p>
          ) : applyStatus === 'pending' ? (
            <div className="admin-links-pending-list">
              {applies.map(renderPendingCard)}
            </div>
          ) : (
            renderApplyTable()
          )}
          </div>

          {!appliesLoading && applyTotal > APPLY_PAGE_SIZE && (
            <div className="admin-pagination">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={applyPage <= 1}
                onClick={() => loadApplies(applyStatus, applyPage - 1)}
              >
                上一页
              </Button>
              <span>{applyPage} / {applyTotalPages}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={applyPage >= applyTotalPages}
                onClick={() => loadApplies(applyStatus, applyPage + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="admin-card admin-links-published-card">
        <div className="admin-card-head">
          <span>已发布友链</span>
          <Badge variant="secondary">{links.filter(l => l.name.trim() && l.url.trim()).length}/20</Badge>
        </div>
        <p className="admin-card-desc">
          保存后立即生效；右侧栏展示可在
          <Link to="/admin/settings" className="admin-inline-link">系统设置 → 右侧栏组件</Link>
          中配置。
        </p>
        <div className="admin-card-body admin-links-editor">
          <div className="admin-links-published-scroll">
          {links.length > 0 && (
            <div className="admin-links-table-head">
              <span>排序</span>
              <span>图标</span>
              <span>名称</span>
              <span>链接</span>
              <span>LOGO 地址</span>
              <span />
            </div>
          )}
          <AdminSortableList
            items={links}
            getId={link => link._key}
            onReorder={setLinks}
            showMoveButtons="auto"
            className="admin-sortable-list admin-links-table-body"
            ariaLabel="已发布友链"
            renderItem={(link, idx, controls) => (
              <div
                ref={controls.setNodeRef}
                style={controls.style}
                className={cn('admin-links-row', controls.isDragging && 'is-dragging')}
              >
                <div className="admin-links-row__order">
                  <SortableDragHandle label={`拖拽调整「${link.name || '友链'}」顺序`} {...controls.dragHandleProps} />
                  {showMoveButtons && (
                    <SortableMoveButtons controls={controls} className="admin-links-row__move" />
                  )}
                </div>
                <div className="admin-links-row__preview">
                  {resolveFriendLinkLogo(link.logo, siteURL) ? (
                    <img src={resolveFriendLinkLogo(link.logo, siteURL)} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span>{linkInitial(link.name)}</span>
                  )}
                </div>
                <div className="admin-links-field admin-links-field--name">
                  <Label htmlFor={`link-name-${link._key}`} className="sr-only">名称</Label>
                  <Input
                    id={`link-name-${link._key}`}
                    placeholder="站点名称"
                    value={link.name}
                    onChange={e => {
                      const next = [...links];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setLinks(next);
                    }}
                  />
                </div>
                <div className="admin-links-field admin-links-field--url">
                  <Label htmlFor={`link-url-${link._key}`} className="sr-only">链接</Label>
                  <Input
                    id={`link-url-${link._key}`}
                    placeholder="https://..."
                    value={link.url}
                    onChange={e => {
                      const next = [...links];
                      next[idx] = { ...next[idx], url: e.target.value };
                      setLinks(next);
                    }}
                  />
                </div>
                <div className="admin-links-field admin-links-field--logo">
                  <Label htmlFor={`link-logo-${link._key}`} className="sr-only">LOGO 地址</Label>
                  <Input
                    id={`link-logo-${link._key}`}
                    placeholder="LOGO 地址（可选）"
                    value={link.logo ?? ''}
                    onChange={e => {
                      const next = [...links];
                      next[idx] = { ...next[idx], logo: e.target.value };
                      setLinks(next);
                    }}
                  />
                </div>
                <div className="admin-links-row__actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setLinks(links.filter((_, i) => i !== idx))}
                    aria-label={`删除「${link.name || '友链'}」`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            )}
          />
          {links.length === 0 && <p className="admin-table-empty">暂无友情链接，可手动添加或审核通过用户申请</p>}
          </div>
          <div className="admin-links-editor__foot">
            <Button type="button" variant="outline" disabled={links.length >= 20} onClick={addLinkRow}>
              <Plus size={14} aria-hidden /> 添加链接
            </Button>
            <Button type="button" variant="ghost" disabled={!isDirty} onClick={resetLinks}>
              <RotateCcw size={14} aria-hidden /> 放弃更改
            </Button>
          </div>
        </div>
      </div>
      </div>

      <Dialog open={!!detailApply} onOpenChange={open => { if (!open) setDetailApply(null); }}>
        <DialogContent className="admin-links-apply-dialog sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>友链申请详情</DialogTitle>
            <DialogDescription>
              确认信息无误后再通过；通过后将写入已发布友链列表。
            </DialogDescription>
          </DialogHeader>
          {detailApply && (
            <div className="admin-links-apply-detail">
              <div className="admin-links-apply-detail__preview">
                <ApplyLogo apply={detailApply} siteURL={siteURL} />
                <div>
                  <strong>{detailApply.name}</strong>
                  <a href={detailApply.url} target="_blank" rel="noopener noreferrer">{detailApply.url}</a>
                </div>
              </div>
              <dl className="admin-links-apply-detail__grid">
                <div><dt>申请人</dt><dd>{renderApplicant(detailApply)}</dd></div>
                <div><dt>提交时间</dt><dd>{formatTime(detailApply.created_at)}</dd></div>
                <div><dt>回链地址</dt><dd>
                  <ReciprocalAddress apply={detailApply} />
                </dd></div>
                <div><dt>回链检测</dt><dd>
                  <Badge variant={reciprocalStatusLabel(detailApply).variant}>
                    {reciprocalStatusLabel(detailApply).text}
                  </Badge>
                </dd></div>
                {detailApply.logo?.trim() && (
                  <div><dt>LOGO</dt><dd className="admin-links-apply-detail__logo-url">{detailApply.logo}</dd></div>
                )}
              </dl>
            </div>
          )}
          <DialogFooter className="admin-links-apply-dialog__footer">
            <Button type="button" variant="outline" onClick={() => setDetailApply(null)}>关闭</Button>
            {detailApply && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={handlingId === detailApply.id || isReciprocalChecking(detailApply) || !reciprocalCheckEnabled}
                  title={!reciprocalCheckEnabled ? '回链检测已关闭' : undefined}
                  onClick={() => recheckReciprocal(detailApply)}
                >
                  <RotateCcw size={14} aria-hidden />
                  {handlingId === detailApply.id ? '处理中…' : '重新检测'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={handlingId === detailApply.id}
                  onClick={() => openReject(detailApply)}
                >
                  <X size={14} aria-hidden /> 拒绝
                </Button>
                <Button
                  type="button"
                  disabled={handlingId === detailApply.id}
                  onClick={() => approveApply(detailApply)}
                >
                  <Check size={14} aria-hidden />
                  {handlingId === detailApply.id ? '处理中…' : '确认通过'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={open => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>拒绝友链申请</DialogTitle>
            <DialogDescription>
              {rejectTarget ? `拒绝「${rejectTarget.name}」的申请，可选填原因通知申请人。` : ''}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            placeholder="拒绝原因（可选）"
            maxLength={256}
            rows={4}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>取消</Button>
            <Button type="button" disabled={rejecting} onClick={submitReject}>
              {rejecting ? '提交中…' : '确认拒绝'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
