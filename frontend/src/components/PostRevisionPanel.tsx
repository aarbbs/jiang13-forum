import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  History, X, Maximize2, Minimize2, GitCompare, FileText, ArrowRight,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostRevision } from '../api/types';
import PostContent from './PostContent';
import { formatDateTime } from '../utils/content';
import { moveTabIndex, useOverlayA11y } from '../hooks/useOverlayA11y';
import {
  type PostSnapshot,
  htmlToDiffText,
  summarizeChange,
  diffTextLines,
  diffTextWords,
  countLineChanges,
} from '../utils/revisionDiff';

interface Props {
  postId: number;
  currentPost: PostSnapshot;
  open: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
}

type ViewMode = 'diff' | 'before' | 'after';

const VIEW_MODES = [
  ['diff', GitCompare, '变更对比'],
  ['before', FileText, '编辑前'],
  ['after', ArrowRight, '编辑后'],
] as const;

interface RevisionEntry {
  rev: PostRevision;
  after: PostSnapshot;
  summary: ReturnType<typeof summarizeChange>;
  index: number;
}

function DiffWords({ before, after }: { before: string; after: string }) {
  const parts = diffTextWords(before, after);
  if (before === after) {
    return <span className="revision-diff-unchanged">{before || '（空）'}</span>;
  }
  return (
    <span className="revision-diff-inline">
      {parts.map((part, i) => {
        if (part.added) return <ins key={i}>{part.value}</ins>;
        if (part.removed) return <del key={i}>{part.value}</del>;
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}

function DiffLines({ before, after }: { before: string; after: string }) {
  const parts = diffTextLines(before, after);
  const { added, removed } = countLineChanges(parts);

  if (before === after) {
    return <p className="revision-diff-unchanged">正文无变化</p>;
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

function ChangeBadges({ summary }: { summary: ReturnType<typeof summarizeChange> }) {
  if (!summary.hasChanges) return <span className="revision-badge revision-badge--none">无变更</span>;
  return (
    <>
      {summary.titleChanged && <span className="revision-badge">标题</span>}
      {summary.contentChanged && <span className="revision-badge">正文</span>}
      {summary.tagsChanged && <span className="revision-badge">标签</span>}
    </>
  );
}

export default function PostRevisionPanel({ postId, currentPost, open, onClose, isLoggedIn }: Props) {
  const [revisions, setRevisions] = useState<PostRevision[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('diff');
  const [fullscreen, setFullscreen] = useState(false);
  const viewTabsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => onClose(), [onClose]);
  useOverlayA11y(open, handleClose, panelRef, { initialFocusRef: closeRef });

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setViewMode('diff');
      setFullscreen(false);
      return;
    }
    setLoading(true);
    api.postRevisions(postId)
      .then(d => {
        const list = d.revisions ?? [];
        setRevisions(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch(e => notify.error(e instanceof Error ? e.message : '加载历史失败'))
      .finally(() => setLoading(false));
  }, [open, postId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const entries: RevisionEntry[] = useMemo(() => {
    return revisions.map((rev, index) => {
      const after: PostSnapshot = index === 0
        ? currentPost
        : {
            title: revisions[index - 1].title,
            content: revisions[index - 1].content,
            tags: revisions[index - 1].tags,
          };
      const before: PostSnapshot = {
        title: rev.title,
        content: rev.content,
        tags: rev.tags,
      };
      return {
        rev,
        after,
        summary: summarizeChange(before, after),
        index: revisions.length - index,
      };
    });
  }, [revisions, currentPost]);

  const selected = entries.find(e => e.rev.id === selectedId) ?? null;

  if (!open) return null;

  const beforeSnap: PostSnapshot | null = selected
    ? { title: selected.rev.title, content: selected.rev.content, tags: selected.rev.tags }
    : null;

  return (
    <div
      className={`post-revision-overlay${fullscreen ? ' post-revision-overlay--fullscreen' : ''}`}
      onClick={handleClose}
    >
      <div
        ref={panelRef}
        className={`post-revision-panel${fullscreen ? ' post-revision-panel--fullscreen' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="编辑历史"
      >
        <header className="post-revision-head">
          <div className="post-revision-head-left">
            <History size={18} aria-hidden />
            <h3>编辑历史</h3>
            {selected && (
              <span className="post-revision-head-sub">
                第 {selected.index} 次编辑
              </span>
            )}
          </div>
          <div className="post-revision-head-actions">
            <div
              ref={viewTabsRef}
              className="post-revision-view-tabs"
              role="tablist"
              aria-label="视图模式"
              onKeyDown={(e) => {
                const idx = VIEW_MODES.findIndex(([m]) => m === viewMode);
                const next = moveTabIndex(e.key, Math.max(0, idx), VIEW_MODES.length);
                if (next == null) return;
                e.preventDefault();
                setViewMode(VIEW_MODES[next][0]);
                requestAnimationFrame(() => {
                  viewTabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
                });
              }}
            >
              {VIEW_MODES.map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  tabIndex={viewMode === mode ? 0 : -1}
                  aria-selected={viewMode === mode}
                  className={`post-revision-tab${viewMode === mode ? ' active' : ''}`}
                  onClick={() => setViewMode(mode)}
                >
                  <Icon size={14} aria-hidden />
                  <span className="post-revision-tab-label">{label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="post-revision-icon-btn"
              onClick={() => setFullscreen(f => !f)}
              title={fullscreen ? '退出全屏' : '全屏显示'}
              aria-label={fullscreen ? '退出全屏' : '全屏显示'}
            >
              {fullscreen ? <Minimize2 size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />}
            </button>
            <button
              ref={closeRef}
              type="button"
              className="post-revision-icon-btn"
              onClick={handleClose}
              aria-label="关闭"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="post-revision-loading"><Spinner size="lg" /></div>
        ) : entries.length === 0 ? (
          <p className="post-revision-empty">暂无编辑记录</p>
        ) : (
          <div className="post-revision-body">
            <aside className="post-revision-sidebar">
              <div className="post-revision-sidebar-label">时间线</div>
              <ul className="post-revision-list">
                {entries.map(entry => (
                  <li key={entry.rev.id}>
                    <button
                      type="button"
                      className={`post-revision-item${selectedId === entry.rev.id ? ' active' : ''}`}
                      onClick={() => setSelectedId(entry.rev.id)}
                    >
                      <div className="post-revision-item-head">
                        <span className="post-revision-item-num">#{entry.index}</span>
                        <ChangeBadges summary={entry.summary} />
                      </div>
                      <span className="post-revision-item-title">{entry.rev.title}</span>
                      <span className="post-revision-item-meta">
                        {entry.rev.editor?.nickname ?? '未知'} · {formatDateTime(entry.rev.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="post-revision-current">
                <span className="post-revision-current-label">当前版本</span>
                <span className="post-revision-current-title">{currentPost.title}</span>
              </div>
            </aside>

            <main className="post-revision-main">
              {selected && beforeSnap ? (
                <>
                  <div className="post-revision-main-head">
                    <div>
                      <span className="post-revision-main-editor">
                        {selected.rev.editor?.nickname ?? '未知'}
                      </span>
                      <span className="post-revision-main-time">
                        {formatDateTime(selected.rev.created_at)}
                      </span>
                    </div>
                    <ChangeBadges summary={selected.summary} />
                  </div>

                  <div className="post-revision-scroll">
                    {viewMode === 'diff' && (
                      <div className="revision-diff-view">
                        <section className="revision-diff-section">
                          <h4>标题</h4>
                          <div className="revision-diff-block">
                            <DiffWords before={beforeSnap.title} after={selected.after.title} />
                          </div>
                        </section>

                        {(beforeSnap.tags || selected.after.tags) && (
                          <section className="revision-diff-section">
                            <h4>标签</h4>
                            <div className="revision-diff-block">
                              <DiffWords
                                before={beforeSnap.tags || '（无）'}
                                after={selected.after.tags || '（无）'}
                              />
                            </div>
                          </section>
                        )}

                        <section className="revision-diff-section revision-diff-section--content">
                          <h4>正文</h4>
                          <DiffLines
                            before={htmlToDiffText(beforeSnap.content)}
                            after={htmlToDiffText(selected.after.content)}
                          />
                        </section>
                      </div>
                    )}

                    {viewMode === 'before' && (
                      <div className="revision-full-view">
                        <h4>{beforeSnap.title}</h4>
                        {beforeSnap.tags && (
                          <p className="revision-full-tags">标签：{beforeSnap.tags}</p>
                        )}
                        <PostContent html={beforeSnap.content} isLoggedIn={isLoggedIn} />
                      </div>
                    )}

                    {viewMode === 'after' && (
                      <div className="revision-full-view">
                        <h4>{selected.after.title}</h4>
                        {selected.after.tags && (
                          <p className="revision-full-tags">标签：{selected.after.tags}</p>
                        )}
                        <PostContent html={selected.after.content} isLoggedIn={isLoggedIn} />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="post-revision-empty">请从左侧选择一次编辑记录</div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
