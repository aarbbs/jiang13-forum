import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { Comment, CommentRevision } from '../api/types';
import { formatTime } from '../utils/content';
import { countLineChanges, diffTextLines } from '../utils/revisionDiff';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comment: Comment | null;
}

function DiffBlock({ before, after }: { before: string; after: string }) {
  const parts = diffTextLines(before, after);
  const { added, removed } = countLineChanges(parts);
  if (before === after) {
    return <p className="revision-diff-unchanged">内容无变化</p>;
  }
  return (
    <div className="revision-diff-lines">
      <div className="revision-diff-stats">
        {removed > 0 && <span className="revision-diff-stat revision-diff-stat--del">删除 {removed} 行</span>}
        {added > 0 && <span className="revision-diff-stat revision-diff-stat--add">新增 {added} 行</span>}
      </div>
      <pre className="revision-diff-pre">
        {parts.map((part, i) => {
          const lines = part.value.split('\n');
          return lines.map((line, j) => {
            if (j === lines.length - 1 && line === '') return null;
            const cls = part.added
              ? 'revision-diff-line revision-diff-line--add'
              : part.removed
                ? 'revision-diff-line revision-diff-line--del'
                : 'revision-diff-line revision-diff-line--same';
            const prefix = part.added ? '+' : part.removed ? '−' : ' ';
            return (
              <div key={`${i}-${j}`} className={cls}>
                <span className="revision-diff-gutter" aria-hidden="true">{prefix}</span>
                <span className="revision-diff-text">{line || ' '}</span>
              </div>
            );
          });
        })}
      </pre>
    </div>
  );
}

/** 管理员查看评论编辑历史 */
export default function CommentRevisionDialog({ open, onOpenChange, comment }: Props) {
  const [revisions, setRevisions] = useState<CommentRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !comment) {
      setRevisions([]);
      setActiveId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.adminCommentRevisions(comment.id)
      .then((r) => {
        if (cancelled) return;
        const list = r.revisions ?? [];
        setRevisions(list);
        setActiveId(list[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) notify.error(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, comment]);

  const active = revisions.find((r) => r.id === activeId) || null;
  const activeIndex = active ? revisions.findIndex((r) => r.id === active.id) : -1;
  const afterContent = activeIndex <= 0
    ? (comment?.content ?? '')
    : (revisions[activeIndex - 1]?.content ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>评论编辑记录</DialogTitle>
          <DialogDescription>
            {comment ? `#${comment.floor} 楼 · 共 ${revisions.length} 次修改前快照` : '评论编辑历史'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : revisions.length === 0 ? (
          <div className="admin-empty">暂无编辑记录</div>
        ) : (
          <div className="comment-rev-layout">
            <aside className="comment-rev-list" aria-label="历史版本">
              {revisions.map((rev, i) => (
                <button
                  key={rev.id}
                  type="button"
                  className={`comment-rev-item${activeId === rev.id ? ' active' : ''}`}
                  onClick={() => setActiveId(rev.id)}
                >
                  <span className="comment-rev-item__ver">版本 {revisions.length - i}</span>
                  <span className="comment-rev-item__meta">
                    {rev.editor?.nickname || `用户 #${rev.editor_id}`}
                    {' · '}
                    {formatTime(rev.created_at)}
                  </span>
                </button>
              ))}
            </aside>
            <div className="comment-rev-detail">
              {active ? (
                <>
                  <p className="comment-rev-detail__hint">
                    与{activeIndex <= 0 ? '当前正文' : '下一版本'}对比
                  </p>
                  <DiffBlock before={active.content} after={afterContent} />
                </>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
