import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { SitePage } from '../../api/types';
import { invalidateSitePagesCache } from '../../hooks/useSitePages';
import AdminSortableList, { SortableDragHandle, SortableMoveButtons } from '../../components/admin/AdminSortableList';
import { persistSortOrderChanges, shouldShowSortableMoveButtons } from '../../utils/sortOrder';
import { formatTime } from '../../utils/content';
import { cn } from '@/lib/utils';

/** 后台：自定义单页列表 */
export default function AdminPagesPage() {
  const nav = useNavigate();
  const { ready } = useAdminGuard();
  const [rows, setRows] = useState<SitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.adminPages()
      .then(d => setRows(d.pages ?? []))
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (ready) load(); }, [ready]);

  const remove = async (id: number) => {
    try {
      await api.adminDeletePage(id);
      invalidateSitePagesCache();
      notify.success('已删除');
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const togglePublished = async (page: SitePage, next: boolean) => {
    const prev = page.published;
    setTogglingId(page.id);
    setRows(list => list.map(r => (r.id === page.id ? { ...r, published: next } : r)));
    try {
      await api.adminSetPagePublished(page.id, next);
      invalidateSitePagesCache();
      notify.success(next ? '已发布' : '已取消发布');
    } catch (e: unknown) {
      setRows(list => list.map(r => (r.id === page.id ? { ...r, published: prev } : r)));
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setTogglingId(null);
    }
  };

  const handlePageReorder = async (reordered: SitePage[]) => {
    const before = [...rows];
    setReordering(true);
    try {
      const after = await persistSortOrderChanges(before, reordered, page =>
        api.adminUpdatePage(page.id, {
          title: page.title,
          slug: page.slug,
          content: page.content,
          published: page.published,
          sort_order: page.sort_order,
          show_in_footer: page.show_in_footer,
          show_in_nav: page.show_in_nav,
        }),
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
  const busy = reordering || togglingId != null;

  if (!ready) return null;

  return (
    <div className="admin-page">
      <header className="admin-page-head admin-page-head-row">
        <div>
          <h1><FileText size={20} aria-hidden /> 单页管理</h1>
          <p>创建「关于我们」「版规」等独立页面</p>
        </div>
        <Button onClick={() => nav('/admin/pages/new')}><Plus size={16} /> 新建单页</Button>
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
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr><td colSpan={8} className="admin-table-empty">暂无单页</td></tr>
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
                    <td>
                      <button
                        type="button"
                        className="admin-table-link"
                        onClick={() => nav(`/admin/pages/${p.id}/edit`)}
                        disabled={busy}
                      >
                        {p.title}
                      </button>
                    </td>
                    <td><code>/page/{p.slug}</code></td>
                    <td>{p.sort_order}</td>
                    <td>
                      <label className="admin-page-publish-toggle">
                        <Switch
                          checked={!!p.published}
                          disabled={busy}
                          onCheckedChange={(v) => togglePublished(p, v)}
                          aria-label={p.published ? `取消发布 ${p.title}` : `发布 ${p.title}`}
                        />
                        <span className={cn(
                          'admin-page-publish-toggle__label',
                          p.published ? 'is-on' : 'is-off',
                        )}>
                          {p.published ? '已发布' : '草稿'}
                        </span>
                      </label>
                    </td>
                    <td>
                      <span className="admin-table-tags">
                        {p.show_in_footer && <Badge variant="outline">页脚</Badge>}
                        {p.show_in_nav && <Badge variant="outline">导航</Badge>}
                        {!p.show_in_footer && !p.show_in_nav && '—'}
                      </span>
                    </td>
                    <td className="admin-table-muted">{p.updated_at ? formatTime(p.updated_at) : '—'}</td>
                    <td className="admin-table-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => nav(`/admin/pages/${p.id}/edit`)}
                        disabled={busy}
                        aria-label={`编辑 ${p.title}`}
                      >
                        <Pencil size={14} />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            aria-label={`删除 ${p.title}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除单页「{p.title}」？</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后不可恢复，前台链接 /page/{p.slug} 将失效。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(p.id)}>删除</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                )}
              />
            )}
          </table>
        </div>
      )}
    </div>
  );
}
