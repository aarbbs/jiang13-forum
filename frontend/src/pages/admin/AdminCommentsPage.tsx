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
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { Comment } from '../../api/types';

export default function AdminCommentsPage() {
  const nav = useNavigate();
  const { ready } = useAdminGuard();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = (p = page) => {
    setLoading(true);
    api.adminComments(p)
      .then(d => {
        setComments(d.comments ?? []);
        setPage(d.page);
        setTotalPages(d.total_pages);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (ready) load(1);
  }, [ready]);

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
        <p>查看与删除楼层评论</p>
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
                    <td>{c.is_private ? <Badge variant="secondary">是</Badge> : '—'}</td>
                    <td>{new Date(c.created_at).toLocaleString('zh-CN')}</td>
                    <td>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">删除</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确定删除该评论？</AlertDialogTitle>
                            <AlertDialogDescription>此操作不可恢复。</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(c.id)}>删除</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {comments.length === 0 && <div className="admin-empty">暂无评论</div>}
            {totalPages > 1 && (
              <div className="admin-pagination">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
                <span>第 {page} / {totalPages} 页</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>下一页</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
