import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

type Tab = 'pending' | 'all';

function statusLabel(status?: string) {
  switch (status) {
    case 'pending': return '待审核';
    case 'rejected': return '未通过';
    case 'published': return '已公开';
    default: return status || '—';
  }
}

export default function AdminCommentsPage() {
  const nav = useNavigate();
  const { ready } = useAdminGuard();
  const [tab, setTab] = useState<Tab>('pending');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [revComment, setRevComment] = useState<Comment | null>(null);

  const load = (p = page, st: Tab = tab) => {
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

  useEffect(() => {
    if (ready) load(1, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab]);

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
      notify.success('评论已删除');
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (!ready) return null;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>评论管理</h1>
        <p>审核普通用户评论；通过后公开，拒绝后仅作者可见并私信通知。</p>
      </div>

      <div className="admin-tabs" role="tablist">
        <button
          type="button"
          className={cn('admin-tab', tab === 'pending' && 'active')}
          onClick={() => setTab('pending')}
        >
          待审核{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <button
          type="button"
          className={cn('admin-tab', tab === 'all' && 'active')}
          onClick={() => setTab('all')}
        >
          全部评论
        </button>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
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
                  <tr key={c.id}>
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
                    <td>{new Date(c.created_at).toLocaleString('zh-CN')}</td>
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
                              <AlertDialogTitle>确定删除该评论？</AlertDialogTitle>
                              <AlertDialogDescription>删除后不可恢复。</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(c.id)}>删除</AlertDialogAction>
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
