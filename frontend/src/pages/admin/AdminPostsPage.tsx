import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Lock, LockOpen, MessageSquareOff, Trash2, RotateCcw } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { PostItem } from '../../api/types';
import { clearAllFeedCache } from '../../utils/feedCache';
import { isTimeDiffSignificant } from '../../utils/content';

type Tab = 'pending' | 'active' | 'trash';
type TrashPost = PostItem & { deleted_at: string };

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
  const [tab, setTab] = useState<Tab>('pending');
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [trash, setTrash] = useState<TrashPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');

  const loadActive = (p = page, kw = search, status = tab === 'pending' ? 'pending' : 'all') => {
    setLoading(true);
    api.adminPosts({ page: p, keyword: kw, status })
      .then(d => {
        setPosts(d.posts ?? []);
        setPage(d.page);
        setTotalPages(d.total_pages);
        setPendingCount(d.pending_count ?? 0);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  const loadTrash = (p = page, kw = search) => {
    setLoading(true);
    api.adminTrashPosts({ page: p, keyword: kw })
      .then(d => {
        setTrash(d.posts ?? []);
        setPage(d.page);
        setTotalPages(d.total_pages);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  const load = (p = 1, kw = search) => {
    if (tab === 'trash') loadTrash(p, kw);
    else loadActive(p, kw, tab === 'pending' ? 'pending' : 'all');
  };

  const approvePost = async (post: PostItem) => {
    try {
      const r = await api.adminApprovePost(post.id);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  useEffect(() => {
    if (!ready) return;
    setPage(1);
    load(1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随 tab/search/ready 刷新
  }, [ready, search, tab]);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setKeyword('');
    setSearch('');
  };

  const togglePin = async (post: PostItem) => {
    try {
      const r = await api.adminPinPost(post.id, !post.pinned);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const toggleBoardPin = async (post: PostItem) => {
    try {
      const r = await api.adminBoardPinPost(post.id, !post.board_pinned);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const toggleFeature = async (post: PostItem) => {
    try {
      const r = await api.adminFeaturePost(post.id, !post.featured);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const rejectPost = async (post: PostItem) => {
    const reason = window.prompt(`拒绝《${post.title}》并私信通知作者，请填写原因：`);
    if (reason == null) return;
    if (!reason.trim()) {
      notify.warning('请填写拒绝原因');
      return;
    }
    try {
      const r = await api.adminRejectPost(post.id, reason.trim());
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const toggleLock = async (post: PostItem) => {
    try {
      const r = await api.adminLockPost(post.id, !post.edit_locked);
      notify.success(r.message);
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const toggleCommentsLock = async (post: PostItem) => {
    try {
      const r = await api.adminCommentsLockPost(post.id, !post.comments_locked);
      notify.success(r.message);
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const remove = async (id: number) => {
    try {
      await api.adminDeletePost(id);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success('帖子已移入回收站');
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const restore = async (id: number) => {
    try {
      await api.adminRestorePost(id);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success('帖子已恢复');
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '恢复失败');
    }
  };

  const purge = async (id: number) => {
    try {
      await api.adminPurgePost(id);
      notify.success('帖子已永久删除');
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '彻底删除失败');
    }
  };

  if (!ready) return null;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>帖子管理</h1>
        <p>
          {tab === 'trash'
            ? '回收站中的帖子可恢复或永久删除；永久删除后不可撤销'
            : tab === 'pending'
              ? '审核普通用户提交的帖子；通过后公开，拒绝后仅作者可见并私信通知'
              : '推荐、全局置顶、板块置顶、锁定编辑/讨论、删除（移入回收站）；支持按标题、标签或正文搜索'}
        </p>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="帖子视图">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          className={cn('admin-tab', tab === 'pending' && 'active')}
          onClick={() => switchTab('pending')}
        >
          待审核{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={cn('admin-tab', tab === 'active' && 'active')}
          onClick={() => switchTab('active')}
        >
          全部帖子
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'trash'}
          className={cn('admin-tab', tab === 'trash' && 'active')}
          onClick={() => switchTab('trash')}
        >
          <Trash2 size={14} aria-hidden />
          回收站
        </button>
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
        ) : tab === 'trash' ? (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>标题</th>
                  <th>板块</th>
                  <th>作者</th>
                  <th>评论</th>
                  <th>删除时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {trash.map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td className="max-w-[220px] truncate">{p.title}</td>
                    <td>{p.board?.name ?? '—'}</td>
                    <td>{p.user?.nickname ?? '—'}</td>
                    <td>{p.comment_count ?? 0}</td>
                    <td className="text-sm whitespace-nowrap">{formatAdminTime(p.deleted_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => restore(p.id)}>
                          <RotateCcw size={14} /> 恢复
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">永久删除</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>永久删除该帖子？</AlertDialogTitle>
                              <AlertDialogDescription>
                                将彻底清除帖子、评论、点赞、收藏与修订历史，此操作不可恢复。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => purge(p.id)}>永久删除</AlertDialogAction>
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
          </>
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
                  <th>推荐</th>
                  <th>全局置顶</th>
                  <th>板块置顶</th>
                  <th>编辑锁</th>
                  <th>讨论锁</th>
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
                    <td>{p.featured ? <Badge variant="orange">是</Badge> : '—'}</td>
                    <td>{p.pinned ? <Badge variant="green">是</Badge> : '—'}</td>
                    <td>{p.board_pinned ? <Badge variant="green">是</Badge> : '—'}</td>
                    <td>{p.edit_locked ? <Badge variant="destructive">是</Badge> : '—'}</td>
                    <td>{p.comments_locked ? <Badge variant="destructive">是</Badge> : '—'}</td>
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
                      <div className="flex gap-1 flex-wrap">
                        {(p.status === 'pending' || p.status === 'rejected') && (
                          <Button size="sm" onClick={() => approvePost(p)}>通过</Button>
                        )}
                        {p.status !== 'rejected' && (
                          <Button size="sm" variant="outline" onClick={() => rejectPost(p)}>
                            拒绝并通知
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => toggleFeature(p)}>
                          {p.featured ? '取消推荐' : '推荐'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => togglePin(p)}>
                          {p.pinned ? '取消全局置顶' : '全局置顶'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleBoardPin(p)}>
                          {p.board_pinned ? '取消板块置顶' : '板块置顶'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleLock(p)}>
                          {p.edit_locked ? <><LockOpen size={14} /> 解锁编辑</> : <><Lock size={14} /> 锁定编辑</>}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleCommentsLock(p)}>
                          {p.comments_locked
                            ? <><LockOpen size={14} /> 开放讨论</>
                            : <><MessageSquareOff size={14} /> 锁定讨论</>}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">删除</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>移入回收站？</AlertDialogTitle>
                              <AlertDialogDescription>
                                帖子与评论将移入回收站，可随时恢复；永久删除请到回收站操作。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(p.id)}>移入回收站</AlertDialogAction>
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
          </>
        )}
        {totalPages > 1 && !loading && (
          <div className="admin-pagination">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
            <span>第 {page} / {totalPages} 页</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>下一页</Button>
          </div>
        )}
      </div>
    </div>
  );
}
