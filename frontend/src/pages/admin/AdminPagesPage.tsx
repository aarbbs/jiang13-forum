import { useEffect, useState } from 'react';
import { FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import ArticleEditor from '../../components/ArticleEditor';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { SitePage } from '../../api/types';
import { invalidateSitePagesCache } from '../../hooks/useSitePages';
import AdminSortableList, { SortableDragHandle, SortableMoveButtons } from '../../components/admin/AdminSortableList';
import { persistSortOrderChanges, shouldShowSortableMoveButtons } from '../../utils/sortOrder';
import { cn } from '@/lib/utils';

const EMPTY: Partial<SitePage> = {
  title: '',
  slug: '',
  content: '',
  published: false,
  sort_order: 0,
  show_in_footer: true,
  show_in_nav: false,
};

function slugify(title: string): string {
  const s = title.trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s.slice(0, 64);
}

/** 后台：自定义单页管理 */
export default function AdminPagesPage() {
  const { ready } = useAdminGuard();
  const [rows, setRows] = useState<SitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<SitePage>>({ ...EMPTY });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = () => {
    setLoading(true);
    api.adminPages()
      .then(d => setRows(d.pages ?? []))
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (ready) load(); }, [ready]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY });
    setDialogOpen(true);
  };

  const openEdit = (p: SitePage) => {
    setEditingId(p.id);
    setForm({ ...p });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.adminUpdatePage(editingId, form);
        notify.success('单页已更新');
      } else {
        await api.adminCreatePage(form);
        notify.success('单页已创建');
      }
      invalidateSitePagesCache();
      setDialogOpen(false);
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('确定删除该单页？')) return;
    try {
      await api.adminDeletePage(id);
      invalidateSitePagesCache();
      notify.success('已删除');
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handlePageReorder = async (reordered: SitePage[]) => {
    const before = [...rows];
    setReordering(true);
    try {
      const after = await persistSortOrderChanges(before, reordered, page =>
        api.adminUpdatePage(page.id, { sort_order: page.sort_order }),
      );
      setRows(after);
      invalidateSitePagesCache();
      notify.success('单页排序已更新');
    } catch (e: unknown) {
      setRows(before);
      notify.error(e instanceof Error ? e.message : '排序保存失败');
    } finally {
      setReordering(false);
    }
  };

  const showMoveButtons = shouldShowSortableMoveButtons(rows.length);

  if (!ready) return null;

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1><FileText size={20} aria-hidden /> 单页管理</h1>
          <p>创建「关于我们」「版规」等独立页面</p>
        </div>
        <Button onClick={openCreate}><Plus size={16} /> 新建单页</Button>
      </header>

      {loading ? <Spinner /> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-[72px]">排序</th>
                <th>标题</th>
                <th>Slug</th>
                <th>权重</th>
                <th>发布</th>
                <th>展示</th>
                <th>操作</th>
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr><td colSpan={7} className="admin-table-empty">暂无单页</td></tr>
              </tbody>
            ) : (
              <AdminSortableList
                as="tbody"
                items={rows}
                getId={p => p.id}
                onReorder={handlePageReorder}
                showMoveButtons="auto"
                renderItem={(p, _index, controls) => (
                  <tr
                    ref={controls.setNodeRef}
                    style={controls.style}
                    className={cn('admin-sortable-table-row', controls.isDragging && 'is-dragging')}
                  >
                    <td>
                      <div className="flex items-center gap-0">
                        <SortableDragHandle label={`拖拽调整「${p.title}」顺序`} {...controls.dragHandleProps} />
                        {showMoveButtons && <SortableMoveButtons controls={controls} />}
                      </div>
                    </td>
                    <td>{p.title}</td>
                    <td><code>/page/{p.slug}</code></td>
                    <td>{p.sort_order}</td>
                    <td>{p.published ? '是' : '否'}</td>
                    <td>{[p.show_in_footer && '页脚', p.show_in_nav && '导航'].filter(Boolean).join('、') || '—'}</td>
                    <td className="admin-table-actions">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} disabled={reordering}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(p.id)} disabled={reordering}><Trash2 size={14} /></Button>
                    </td>
                  </tr>
                )}
              />
            )}
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="admin-page-dialog">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑单页' : '新建单页'}</DialogTitle>
          </DialogHeader>
          <div className="admin-form-grid">
            <div>
              <Label htmlFor="page-title">标题</Label>
              <Input
                id="page-title"
                value={form.title ?? ''}
                onChange={e => {
                  const title = e.target.value;
                  setForm(f => ({
                    ...f,
                    title,
                    slug: f.slug || slugify(title),
                  }));
                }}
              />
            </div>
            <div>
              <Label htmlFor="page-slug">Slug（URL 路径）</Label>
              <Input
                id="page-slug"
                value={form.slug ?? ''}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="about-us"
              />
            </div>
            <div className="admin-form-row">
              <Label htmlFor="page-sort">排序</Label>
              <Input
                id="page-sort"
                type="number"
                value={form.sort_order ?? 0}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="admin-form-switches">
              <label><Switch checked={!!form.published} onCheckedChange={v => setForm(f => ({ ...f, published: v }))} /> 发布</label>
              <label><Switch checked={!!form.show_in_footer} onCheckedChange={v => setForm(f => ({ ...f, show_in_footer: v }))} /> 页脚展示</label>
              <label><Switch checked={!!form.show_in_nav} onCheckedChange={v => setForm(f => ({ ...f, show_in_nav: v }))} /> 侧栏导航</label>
            </div>
            <div>
              <Label>正文</Label>
              <ArticleEditor
                value={form.content ?? ''}
                onChange={html => setForm(f => ({ ...f, content: html }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
