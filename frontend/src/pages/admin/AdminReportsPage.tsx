import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { api } from '../../api/client';
import type { PostReport } from '../../api/types';
import { formatTime } from '../../utils/content';
import { reportReasonLabel, reportStatusLabel } from '../../utils/report';
import { cn } from '@/lib/utils';

type StatusTab = 'pending' | 'resolved' | 'dismissed' | 'all';
type HandleAction = 'dismiss' | 'resolve' | 'reject_post' | 'reject_comment';

function isCommentReport(r: PostReport) {
  return !!(r.comment_id && r.comment_id > 0);
}

function commentExcerpt(r: PostReport) {
  const raw = (r.comment?.content || '').trim();
  if (!raw) return '';
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
}

export default function AdminReportsPage() {
  const nav = useNavigate();
  const [status, setStatus] = useState<StatusTab>('pending');
  const [list, setList] = useState<PostReport[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PostReport | null>(null);
  const [action, setAction] = useState<HandleAction | null>(null);
  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (p = 1, st: StatusTab = status) => {
    setLoading(true);
    try {
      const r = await api.adminReports({ page: p, status: st });
      setList(r.reports || []);
      setTotal(r.total || 0);
      setPendingCount(r.pending_count || 0);
      setPage(r.page || p);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load(1, status);
  }, [status, load]);

  const openHandle = (rep: PostReport, act: HandleAction) => {
    setActive(rep);
    setAction(act);
    setNote('');
    setRejectReason('');
  };

  const submitHandle = async () => {
    if (!active || !action) return;
    if ((action === 'reject_post' || action === 'reject_comment') && !rejectReason.trim()) {
      notify.warning('请填写拒绝原因（将私信通知作者）');
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.adminHandleReport(active.id, {
        action,
        handle_note: note.trim() || undefined,
        reject_reason: (action === 'reject_post' || action === 'reject_comment')
          ? rejectReason.trim()
          : undefined,
      });
      notify.success(r.message);
      setActive(null);
      setAction(null);
      load(page, status);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '处理失败');
    } finally {
      setSubmitting(false);
    }
  };

  const openTarget = (r: PostReport) => {
    const floor = r.comment?.floor;
    const hash = floor && floor > 0 ? `#floor-${floor}` : '';
    nav(`/post/${r.post_id}${hash}`);
  };

  const tabs: { key: StatusTab; label: string }[] = [
    { key: 'pending', label: `待处理${pendingCount ? ` (${pendingCount})` : ''}` },
    { key: 'resolved', label: '已处理' },
    { key: 'dismissed', label: '已忽略' },
    { key: 'all', label: '全部' },
  ];

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">举报管理</h1>
      <p className="admin-page-desc">处理用户对帖子与评论的举报；拒绝时将通过站内私信通知作者。</p>

      <div className="admin-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={cn('admin-tab', status === t.key && 'active')}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>目标</th>
                <th>原因</th>
                <th>举报人</th>
                <th>状态</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const commentRep = isCommentReport(r);
                const excerpt = commentRep ? commentExcerpt(r) : '';
                return (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td className="max-w-[260px]">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Badge variant={commentRep ? 'secondary' : 'outline'}>
                          {commentRep ? '评论' : '帖子'}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        className="admin-text-link truncate block max-w-full text-left"
                        onClick={() => openTarget(r)}
                      >
                        {r.post?.title || `帖子 #${r.post_id}`}
                        {commentRep && r.comment?.floor ? ` · #${r.comment.floor}` : ''}
                      </button>
                      {excerpt && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{excerpt}</div>
                      )}
                      {r.detail && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.detail}</div>
                      )}
                    </td>
                    <td>{reportReasonLabel(r.reason)}</td>
                    <td>{r.reporter?.nickname || `#${r.reporter_id}`}</td>
                    <td>
                      <Badge variant={r.status === 'pending' ? 'orange' : r.status === 'resolved' ? 'green' : 'secondary'}>
                        {reportStatusLabel(r.status)}
                      </Badge>
                    </td>
                    <td className="text-sm whitespace-nowrap">{formatTime(r.created_at)}</td>
                    <td>
                      {r.status === 'pending' ? (
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => openHandle(r, 'dismiss')}>忽略</Button>
                          <Button size="sm" variant="outline" onClick={() => openHandle(r, 'resolve')}>标记已处理</Button>
                          {commentRep ? (
                            <Button size="sm" variant="destructive" onClick={() => openHandle(r, 'reject_comment')}>
                              拒绝该评论
                            </Button>
                          ) : (
                            <Button size="sm" variant="destructive" onClick={() => openHandle(r, 'reject_post')}>
                              拒绝并通知
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {r.handle_note || '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <div className="admin-empty">暂无举报</div>}
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground self-center">第 {page} 页</span>
              <Button size="sm" variant="outline" disabled={list.length < 20} onClick={() => load(page + 1)}>下一页</Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!action && !!active} onOpenChange={(o) => { if (!o) { setAction(null); setActive(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'dismiss' && '忽略举报'}
              {action === 'resolve' && '标记已处理'}
              {action === 'reject_post' && '拒绝帖子并通知作者'}
              {action === 'reject_comment' && '拒绝评论并通知作者'}
            </DialogTitle>
            <DialogDescription>
              {action === 'reject_post'
                ? '帖子将标记为未通过，拒绝原因会通过站内私信发给作者；举报人也会收到处理结果通知。'
                : action === 'reject_comment'
                  ? '评论将标记为未通过，拒绝原因会通过站内私信发给评论作者；举报人也会收到处理结果通知。'
                  : '举报人将收到处理结果的站内私信通知。'}
            </DialogDescription>
          </DialogHeader>
          <div className="pm-compose-fields">
            {(action === 'reject_post' || action === 'reject_comment') && (
              <label className="pm-field">
                <span>拒绝原因（发给作者）</span>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="请说明未通过的原因…"
                />
              </label>
            )}
            <label className="pm-field">
              <span>处理备注（可选，发给举报人）</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="补充说明…"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setActive(null); }}>取消</Button>
            <Button
              variant={action === 'reject_post' || action === 'reject_comment' ? 'destructive' : 'default'}
              loading={submitting}
              onClick={submitHandle}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
