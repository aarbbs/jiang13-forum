import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { PostItem } from '../../api/types';
import { clearAllFeedCache } from '../../utils/feedCache';
import { isTimeDiffSignificant } from '../../utils/content';

function formatAdminTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminPostsPage() {
  const nav = useNavigate();
  const { ready } = useAdminGuard();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');

  const load = (p = page, kw = search) => {
    setLoading(true);
    api.adminPosts({ page: p, keyword: kw })
      .then(d => {
        setPosts(d.posts ?? []);
        setPage(d.page);
        setTotalPages(d.total_pages);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (ready) load(1, search);
  }, [ready, search]);

  const togglePin = async (post: PostItem) => {
    try {
      const r = await api.adminPinPost(post.id, !post.pinned);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const toggleLock = async (post: PostItem) => {
    try {
      const r = await api.adminLockPost(post.id, !post.edit_locked);
      notify.success(r.message);
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const remove = async (id: number) => {
    try {
      await api.adminDeletePost(id);
      notify.success('帖子已删除');
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (!ready) return null;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>帖子管理</h1>
        <p>置顶、锁定编辑、删除帖子；支持按标题、标签或正文关键词搜索</p>
      </div>

      <form
        className="admin-search-bar"
        onSubmit={e => { e.preventDefault(); setSearch(keyword.trim()); }}
      >
        <Input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="搜索标题、标签或正文…"
        />
        <Button type="submit"><Search size={16} />搜索</Button>
        {search && (
          <Button type="button" variant="outline" onClick={() => { setKeyword(''); setSearch(''); }}>
            清除
          </Button>
        )}
      </form>

      <div className="admin-card">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>标题</th>
                  <th>板块</th>
                  <th>作者</th>
                  <th>标签</th>
                  <th>评论</th>
                  <th>置顶</th>
                  <th>锁定</th>
                  <th>点赞</th>
                  <th>浏览</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(p => {
                  const edited = p.updated_at && isTimeDiffSignificant(p.created_at, p.updated_at);
                  return (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td className="max-w-[200px] truncate">
                      <button type="button" className="admin-text-link" onClick={() => nav(`/post/${p.id}`)}>
                        {p.title}
                      </button>
                      {edited && <Badge variant="secondary" className="ml-1">已编辑</Badge>}
                    </td>
                    <td>{p.board?.name ?? '—'}</td>
                    <td>
                      {p.user?.id ? (
                        <button type="button" className="admin-text-link" onClick={() => nav(`/user/${p.user!.id}`)}>
                          {p.user.nickname}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="max-w-[120px] truncate text-muted-foreground">{p.tags || '—'}</td>
                    <td>{p.comment_count ?? 0}</td>
                    <td>{p.pinned ? <Badge variant="orange">是</Badge> : '—'}</td>
                    <td>{p.edit_locked ? <Badge variant="destructive">是</Badge> : '—'}</td>
                    <td>{p.like_count}</td>
                    <td>{p.view_count}</td>
                    <td className="text-sm whitespace-nowrap">
                      <span>{formatAdminTime(p.created_at)}</span>
                      {edited && p.updated_at && (
                        <span className="block text-muted-foreground text-xs">
                          改于 {formatAdminTime(p.updated_at)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => togglePin(p)}>
                          {p.pinned ? '取消置顶' : '置顶'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleLock(p)}>
                          {p.edit_locked ? <><LockOpen size={14} /> 解锁</> : <><Lock size={14} /> 锁定</>}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">删除</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确定删除该帖子？</AlertDialogTitle>
                              <AlertDialogDescription>相关评论也将一并删除，不可恢复。</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(p.id)}>删除</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {posts.length === 0 && <div className="admin-empty">没有找到帖子</div>}
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
