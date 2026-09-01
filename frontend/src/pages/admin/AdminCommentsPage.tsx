import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { Comment } from '../../api/types';
import CommentRevisionDialog from '../../components/CommentRevisionDialog';
import { isTimeDiffSignificant } from '../../utils/content';

type Tab = 'pending' | 'all' | 'trash';
type TrashComment = Comment & { deleted_at: string };

function statusLabel(status?: string) {
  switch (status) {
    case 'pending': return '待审核';
    case 'rejected': return '未通过';
    case 'published': return '已公开';
    default: return status || '—';
  }
}

function formatAdminTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminCommentsPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = Number(searchParams.get('id') || 0) || 0;
  const { ready } = useAdminGuard();
  const [tab, setTab] = useState<Tab>('pending');
  const [comments, setComments] = useState<Comment[]>([]);
  const [trash, setTrash] = useState<TrashComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [revComment, setRevComment] = useState<Comment | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(focusId > 0 ? focusId : null);
  const focusTriedRef = useRef(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadList = (p = page, st: Tab = tab) => {
    setLoading(true);
    api.adminComments({ page: p, status: st === 'pending' ? 'pending' : 'all' })
      .then(d => {
        setComments(d.comments ?? []);
        setPage(d.page);
        setTotalPages(d.total_pages);
        setPendingCount(d.pending_count ?? 0);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  const loadTrash = (p = page) => {
    setLoading(true);
    api.adminTrashComments({ page: p })
      .then(d => {
        setTrash(d.comments ?? []);
        setPage(d.page);
        setTotalPages(d.total_pages);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  const load = (p = page, st: Tab = tab) => {
    if (st === 'trash') loadTrash(p);
    else loadList(p, st);
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
  };

  useEffect(() => {
    if (ready) load(1, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab]);

  // 从通知深链 ?id= 定位并高亮待审行
  useEffect(() => {
    if (!ready || loading || focusId <= 0 || focusTriedRef.current) return;
    if (tab === 'trash') return;

    const found = comments.find((c) => c.id === focusId);
    if (found) {
      focusTriedRef.current = true;
      setHighlightId(focusId);
      requestAnimationFrame(() => {
        document.getElementById(`admin-comment-row-${focusId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 2800);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
      return;
    }

    // pending 未找到则切到全部再试一次
    if (tab === 'pending') {
      setTab('all');
      setPage(1);
      return;
    }

    focusTriedRef.current = true;
    notify.warning('该评论可能已审核或不在当前列表');
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  }, [ready, loading, comments, focusId, tab, searchParams, setSearchParams]);

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  const approve = async (id: number) => {
    try {
      const r = await api.adminApproveComment(id);
      notify.success(r.message);
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const reject = async (c: Comment) => {
    const reason = window.prompt('拒绝原因（将私信通知作者）：', '不符合社区规范');
    if (reason == null) return;
    try {
      const r = await api.adminRejectComment(c.id, reason.trim() || undefined);
      notify.success(r.message);
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const remove = async (id: number) => {
    try {
      await api.adminDeleteComment(id);
      notify.success('评论已移入回收站');
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const restore = async (id: number) => {
    try {
      await api.adminRestoreComment(id);
      notify.success('评论已恢复');
      loadTrash(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '恢复失败');
    }
  };

  const purge = async (id: number) => {
    try {
      await api.adminPurgeComment(id);
      notify.success('评论已永久删除');
      loadTrash(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '永久删除失败');
    }
  };

  if (!ready) return null;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>评论管理</h1>
        <p>
          {tab === 'trash'
            ? '回收站中的评论可恢复或永久删除；永久删除后不可撤销'
            : '审核普通用户评论；通过后公开，拒绝后仅作者可见并私信通知。删除将移入回收站。'}
        </p>
      </div>

      <div className="admin-tabs" role="tablist">
        <button
          type="button"
          className={cn('admin-tab', tab === 'pending' && 'active')}
          onClick={() => switchTab('pending')}
        >
          待审核{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <button
          type="button"
          className={cn('admin-tab', tab === 'all' && 'active')}
          onClick={() => switchTab('all')}
        >
          全部评论
        </button>
        <button
          type="button"
          aria-selected={tab === 'trash'}
          className={cn('admin-tab', tab === 'trash' && 'active')}
          onClick={() => switchTab('trash')}
        >
          <Trash2 size={14} aria-hidden />
          回收站
        </button>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : tab === 'trash' ? (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>楼层</th>
                  <th>帖子</th>
                  <th>作者</th>
                  <th>内容</th>
                  <th>删除时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {trash.map(c => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>#{c.floor}</td>
                    <td>
                      <button type="button" className="admin-text-link" onClick={() => nav(`/post/${c.post_id}`)}>
                        {c.post?.title ?? `#${c.post_id}`}
                      </button>
                    </td>
                    <td>
                      {c.user_id && c.user ? c.user.nickname : (c.guest_nick || '游客')}
                    </td>
                    <td className="max-w-[200px] truncate">{c.content}</td>
                    <td className="text-sm whitespace-nowrap">{formatAdminTime(c.deleted_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => restore(c.id)}>
                          <RotateCcw size={14} /> 恢复
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">永久删除</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>永久删除该评论？</AlertDialogTitle>
                              <AlertDialogDescription>
                                将彻底清除该评论及其已删回复、修订与点赞，此操作不可恢复。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => purge(c.id)}>永久删除</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trash.length === 0 && <div className="admin-empty">回收站为空</div>}
            {totalPages > 1 && (
              <div className="admin-pagination">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => loadTrash(page - 1)}>上一页</Button>
                <span>{page} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => loadTrash(page + 1)}>下一页</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>楼层</th>
                  <th>帖子</th>
                  <th>作者</th>
                  <th>内容</th>
                  <th>状态</th>
                  <th>私密</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {comments.map(c => (
                  <tr
                    key={c.id}
                    id={`admin-comment-row-${c.id}`}
                    className={cn(highlightId === c.id && 'admin-row-highlight')}
                  >
                    <td>{c.id}</td>
                    <td>#{c.floor}</td>
                    <td>
                      <button type="button" className="admin-text-link" onClick={() => nav(`/post/${c.post_id}`)}>
                        {c.post?.title ?? `#${c.post_id}`}
                      </button>
                    </td>
                    <td>
                      {c.user_id && c.user ? (
                        <button type="button" className="admin-text-link" onClick={() => nav(`/user/${c.user_id}`)}>
                          {c.user.nickname}
                        </button>
                      ) : (c.guest_nick || '游客')}
                    </td>
                    <td className="max-w-[200px] truncate">{c.content}</td>
                    <td>
                      <Badge variant={c.status === 'pending' ? 'orange' : c.status === 'rejected' ? 'destructive' : 'green'}>
                        {statusLabel(c.status)}
                      </Badge>
                    </td>
                    <td>{c.is_private ? <Badge variant="secondary">是</Badge> : '—'}</td>
                    <td>{formatAdminTime(c.created_at)}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {(c.status === 'pending' || c.status === 'rejected') && (
                          <Button size="sm" onClick={() => approve(c.id)}>通过</Button>
                        )}
                        {c.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => reject(c)}>拒绝</Button>
                        )}
                        {c.updated_at && isTimeDiffSignificant(c.created_at, c.updated_at) && (
                          <Button size="sm" variant="outline" onClick={() => setRevComment(c)}>编辑记录</Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">删除</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>移入回收站？</AlertDialogTitle>
                              <AlertDialogDescription>
                                将同时移入其下所有回复，可随时恢复；永久删除请到回收站操作。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(c.id)}>移入回收站</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {comments.length === 0 && <div className="admin-empty">暂无评论</div>}
            {totalPages > 1 && (
              <div className="admin-pagination">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
                <span>{page} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>下一页</Button>
              </div>
            )}
          </>
        )}
      </div>

      <CommentRevisionDialog
        open={!!revComment}
        onOpenChange={(open) => { if (!open) setRevComment(null); }}
        comment={revComment}
      />
    </div>
  );
}
