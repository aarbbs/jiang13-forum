import { useEffect, useMemo, useState } from 'react';
import {
  Award, Pencil, Plus, Search, Sparkles, Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { BadgeDef } from '../../api/types';
import {
  BADGE_ICON_OPTIONS,
  BADGE_METRIC_OPTIONS,
  badgeIcon,
  formatBadgeCondition,
} from '../../utils/badgeIcons';

type KindTab = 'all' | 'auto' | 'limited';

const EMPTY: Partial<BadgeDef> = {
  code: '',
  name: '',
  description: '',
  icon: 'star',
  kind: 'limited',
  metric: 'tenure_days',
  threshold: 30,
  sort_order: 100,
  enabled: true,
};

function slugifyCode(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
  return ascii.slice(0, 32) || `badge_${Date.now().toString(36)}`;
}

/** 后台：徽章定义（卡片预览 + 弹窗编辑） */
export default function AdminBadgesPage() {
  const { ready } = useAdminGuard();
  const [rows, setRows] = useState<BadgeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<KindTab>('all');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<BadgeDef>>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.adminListBadges()
      .then(d => setRows(d.badges ?? []))
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (ready) load();
  }, [ready]);

  const counts = useMemo(() => ({
    all: rows.length,
    auto: rows.filter(b => b.kind === 'auto').length,
    limited: rows.filter(b => b.kind === 'limited').length,
    disabled: rows.filter(b => !b.enabled).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(b => {
      if (tab === 'auto' && b.kind !== 'auto') return false;
      if (tab === 'limited' && b.kind !== 'limited') return false;
      if (!q) return true;
      return [b.code, b.name, b.description, b.icon, b.metric]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, tab, query]);

  const openCreate = () => {
    setForm({ ...EMPTY });
    setDialogOpen(true);
  };

  const openEdit = (b: BadgeDef) => {
    setForm({ ...b });
    setDialogOpen(true);
  };

  const save = async () => {
    const name = form.name?.trim() || '';
    let code = form.code?.trim() || '';
    if (!name) {
      notify.warning('请填写徽章名称');
      return;
    }
    if (!form.id && !code) {
      code = slugifyCode(name);
    }
    if (!code) {
      notify.warning('请填写徽章代码');
      return;
    }
    if (form.kind === 'auto' && !form.metric) {
      notify.warning('请选择自动成就指标');
      return;
    }
    setSaving(true);
    try {
      const r = await api.adminUpsertBadge({
        ...form,
        code,
        name,
        kind: form.kind || 'limited',
        metric: form.kind === 'auto' ? (form.metric || 'tenure_days') : '',
        threshold: form.kind === 'auto' ? (form.threshold ?? 0) : 0,
        icon: form.icon || 'star',
        enabled: form.enabled !== false,
      });
      notify.success(r.message);
      setDialogOpen(false);
      resetForm();
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => setForm({ ...EMPTY });

  const toggleEnabled = async (b: BadgeDef) => {
    setTogglingId(b.id);
    try {
      await api.adminUpsertBadge({ ...b, enabled: !b.enabled });
      notify.success(b.enabled ? '已停用' : '已启用');
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setTogglingId(null);
    }
  };

  if (!ready) return null;

  const PreviewIcon = badgeIcon(form.icon);
  const isEdit = !!form.id;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div className="admin-page-head-row">
          <div>
            <h1>徽章管理</h1>
            <p>设计自动成就与限定徽章；限定徽章在「用户管理」中颁发给用户</p>
          </div>
          <Button onClick={openCreate}>
            <Plus size={16} />
            新建徽章
          </Button>
        </div>
      </div>

      <div className="admin-badge-stats" aria-label="徽章统计">
        <div className="admin-badge-stat">
          <strong>{counts.all}</strong>
          <span>全部</span>
        </div>
        <div className="admin-badge-stat">
          <strong>{counts.auto}</strong>
          <span>自动成就</span>
        </div>
        <div className="admin-badge-stat">
          <strong>{counts.limited}</strong>
          <span>限定徽章</span>
        </div>
        <div className="admin-badge-stat">
          <strong>{counts.disabled}</strong>
          <span>已停用</span>
        </div>
      </div>

      <div className="admin-badge-toolbar">
        <div className="admin-tabs" role="tablist" aria-label="徽章类型">
          {([
            ['all', '全部'],
            ['auto', '自动成就'],
            ['limited', '限定徽章'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={cn('admin-tab', tab === key && 'active')}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="admin-badge-search">
          <Search size={15} aria-hidden />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索名称、代码、说明…"
            aria-label="搜索徽章"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="admin-badge-empty">
          <Award size={36} strokeWidth={1.25} aria-hidden />
          <h3>{query ? '没有匹配的徽章' : '还没有徽章'}</h3>
          <p>
            {query
              ? '试试其他关键词，或切换类型筛选'
              : '创建自动成就（达条件发放）或限定徽章（站长颁发）'}
          </p>
          {!query && (
            <Button onClick={openCreate}>
              <Plus size={16} />
              创建第一个徽章
            </Button>
          )}
        </div>
      ) : (
        <div className="admin-badge-grid">
          {filtered.map(b => {
            const Icon = badgeIcon(b.icon);
            return (
              <article
                key={b.id}
                className={cn('admin-badge-card', !b.enabled && 'is-disabled')}
              >
                <div className="admin-badge-card-top">
                  <div className={cn('admin-badge-preview', b.kind === 'limited' && 'is-limited')}>
                    <Icon size={22} aria-hidden />
                  </div>
                  <div className="admin-badge-card-meta">
                    <div className="admin-badge-card-title-row">
                      <h3>{b.name}</h3>
                      {b.kind === 'auto'
                        ? <Badge variant="secondary">自动</Badge>
                        : <Badge variant="orange">限定</Badge>}
                      {!b.enabled && <Badge variant="destructive">停用</Badge>}
                    </div>
                    <code className="admin-badge-code">{b.code}</code>
                  </div>
                </div>

                <p className="admin-badge-desc">
                  {b.description?.trim() || (b.kind === 'limited' ? '站长手动颁发的限定徽章' : '达成条件后自动获得')}
                </p>

                <div className="admin-badge-card-foot">
                  <span className="admin-badge-condition" title="获得条件">
                    {b.kind === 'auto' ? <Sparkles size={13} aria-hidden /> : <Trophy size={13} aria-hidden />}
                    {formatBadgeCondition(b)}
                  </span>
                  <div className="admin-badge-card-actions">
                    <label className="admin-badge-switch" title={b.enabled ? '点击停用' : '点击启用'}>
                      <span className="sr-only">启用</span>
                      <Switch
                        checked={b.enabled}
                        disabled={togglingId === b.id}
                        onCheckedChange={() => toggleEnabled(b)}
                      />
                    </label>
                    <Button size="sm" variant="outline" onClick={() => openEdit(b)}>
                      <Pencil size={13} />
                      编辑
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="admin-badge-dialog sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑徽章' : '新建徽章'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? '修改后立即对展示生效；代码不可更改。'
                : '自动成就按指标发放，限定徽章需在用户管理中手动颁发。'}
            </DialogDescription>
          </DialogHeader>

          <div className="admin-badge-dialog-preview">
            <div className={cn('admin-badge-preview admin-badge-preview--lg', form.kind === 'limited' && 'is-limited')}>
              <PreviewIcon size={28} aria-hidden />
            </div>
            <div>
              <div className="admin-badge-dialog-preview-name">{form.name?.trim() || '徽章名称'}</div>
              <div className="admin-badge-dialog-preview- Cond">
                {formatBadgeCondition({
                  kind: form.kind,
                  metric: form.metric,
                  threshold: form.threshold,
                  description: form.description,
                })}
              </div>
            </div>
          </div>

          <div className="admin-badge-dialog-fields">
            <div className="admin-badge-kind-seg" role="group" aria-label="徽章类型">
              <button
                type="button"
                className={cn(form.kind !== 'limited' && 'active')}
                onClick={() => setForm(f => ({ ...f, kind: 'auto', metric: f.metric || 'tenure_days' }))}
              >
                <Sparkles size={14} />
                自动成就
              </button>
              <button
                type="button"
                className={cn(form.kind === 'limited' && 'active')}
                onClick={() => setForm(f => ({ ...f, kind: 'limited' }))}
              >
                <Trophy size={14} />
                限定徽章
              </button>
            </div>

            <div className="admin-badge-field-row">
              <div className="admin-badge-field">
                <Label htmlFor="badge-name">名称</Label>
                <Input
                  id="badge-name"
                  value={form.name || ''}
                  onChange={e => {
                    const name = e.target.value;
                    setForm(f => ({
                      ...f,
                      name,
                      code: isEdit ? f.code : (f.code?.trim() ? f.code : slugifyCode(name)),
                    }));
                  }}
                  placeholder="例如：资深居民"
                  autoFocus
                />
              </div>
              <div className="admin-badge-field">
                <Label htmlFor="badge-code">代码</Label>
                <Input
                  id="badge-code"
                  value={form.code || ''}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="tenure_365"
                  disabled={isEdit}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="admin-badge-field">
              <Label htmlFor="badge-desc">说明</Label>
              <Input
                id="badge-desc"
                value={form.description || ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="鼠标悬停时显示的获得条件"
              />
            </div>

            <div className="admin-badge-field">
              <Label>图标</Label>
              <div className="admin-badge-icon-picker" role="listbox" aria-label="选择图标">
                {BADGE_ICON_OPTIONS.map(opt => {
                  const active = (form.icon || 'star') === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      title={opt.label}
                      className={cn('admin-badge-icon-opt', active && 'active')}
                      onClick={() => setForm(f => ({ ...f, icon: opt.key }))}
                    >
                      <opt.Icon size={18} aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>

            {form.kind === 'auto' && (
              <div className="admin-badge-field-row">
                <div className="admin-badge-field">
                  <Label htmlFor="badge-metric">达成指标</Label>
                  <select
                    id="badge-metric"
                    className="admin-select"
                    value={form.metric || 'tenure_days'}
                    onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
                  >
                    {BADGE_METRIC_OPTIONS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <span className="admin-badge-field-hint">
                    {BADGE_METRIC_OPTIONS.find(m => m.value === (form.metric || 'tenure_days'))?.hint}
                  </span>
                </div>
                <div className="admin-badge-field">
                  <Label htmlFor="badge-threshold">阈值</Label>
                  <Input
                    id="badge-threshold"
                    type="number"
                    min={0}
                    value={form.threshold ?? 0}
                    onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            )}

            <div className="admin-badge-field-row admin-badge-field-row--end">
              <div className="admin-badge-field">
                <Label htmlFor="badge-sort">排序权重</Label>
                <Input
                  id="badge-sort"
                  type="number"
                  value={form.sort_order ?? 100}
                  onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                />
              </div>
              <label className="admin-badge-enable-row">
                <Switch
                  checked={form.enabled !== false}
                  onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))}
                />
                <span>启用此徽章</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={save} loading={saving}>
              {isEdit ? '保存修改' : '创建徽章'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
