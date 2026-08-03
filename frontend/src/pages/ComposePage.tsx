import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useParams, useOutletContext } from 'react-router-dom';
import { ArrowLeft, Send, Pencil } from 'lucide-react';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { Board } from '../api/types';
import { isHtmlEmpty } from '../utils/postContent';
import { useForumLimits } from '../hooks/useForumLimits';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import ArticleEditor from '../components/ArticleEditor';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
import TagInput, { serializeTags, parseTags } from '../components/TagInput';
import { Spinner } from '@/components/ui/spinner';
import { getCachedBoards } from '../utils/layoutCache';
import type { LayoutCtx } from '../layouts/MainLayout';
import { loginPath } from '../utils/authRedirect';
import { useNoIndexSEO } from '../hooks/usePageSEO';
import { parsePermalinkID, postPath } from '../utils/permalink';
import {
  loadComposeDraft,
  saveComposeDraft,
  clearComposeDraft,
  draftHasContent,
} from '../utils/composeDraft';

interface ComposeBaseline {
  title: string;
  tags: string;
  content: string;
  boardId: string;
}

function resolveBoards(ctxBoards?: Board[]): Board[] {
  if (ctxBoards && ctxBoards.length > 0) return ctxBoards;
  return getCachedBoards();
}

/** 格式化剩余可编辑时间 */
function formatEditRemaining(createdAt: string, windowHours: number): string {
  if (windowHours <= 0) return '';
  const deadline = new Date(createdAt).getTime() + windowHours * 3600_000;
  const ms = deadline - Date.now();
  if (ms <= 0) return '可编辑时限已到';
  const hours = Math.floor(ms / 3600_000);
  const mins = Math.floor((ms % 3600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `还可编辑约 ${days} 天`;
  }
  if (hours > 0) return `还可编辑约 ${hours} 小时 ${mins} 分`;
  return `还可编辑约 ${mins} 分钟`;
}

export default function ComposePage() {
  const nav = useNavigate();
  const { id: editIdParam } = useParams();
  const editId = editIdParam ? parsePermalinkID(editIdParam) : null;
  const isEdit = editId !== null && !Number.isNaN(editId);
  const [params] = useSearchParams();
  const defaultBoard = params.get('board') || '';
  const { user, loading: authLoading } = useAuth();
  const { limits } = useForumLimits();
  useNoIndexSEO(isEdit ? '编辑帖子' : '发帖');
  const layoutCtx = useOutletContext<LayoutCtx | undefined>();

  const [boards, setBoards] = useState<Board[]>(() => resolveBoards(layoutCtx?.boards));
  const [boardId, setBoardId] = useState(defaultBoard);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  /** 新建帖：板块列表是否已就绪（避免请求中误显空态） */
  const [boardsReady, setBoardsReady] = useState(
    () => isEdit || resolveBoards(layoutCtx?.boards).length > 0,
  );
  const [baseline, setBaseline] = useState<ComposeBaseline | null>(null);
  const [editWindowHint, setEditWindowHint] = useState('');
  const [draftHint, setDraftHint] = useState('');
  const draftReadyRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      nav(loginPath(isEdit ? `/post/${editId}/edit` : '/compose'));
      return;
    }

    if (isEdit) {
      setLoading(true);
      draftReadyRef.current = false;
      const cached = resolveBoards(layoutCtx?.boards);
      const boardsPromise = cached.length > 0
        ? Promise.resolve({ boards: cached })
        : api.boards();
      Promise.all([boardsPromise, api.post(editId!, { skipView: true })])
        .then(([boardsData, postData]) => {
          const list = boardsData.boards ?? [];
          setBoards(list);
          const post = postData.post;
          const isOwnerOrAdmin = user.role === 'admin' || post.user_id === user.id;
          if (!isOwnerOrAdmin) {
            notify.error('无权编辑此帖子');
            nav(postPath(editId!, limits));
            return;
          }
          if (!postData.can_edit) {
            notify.error(postData.edit_block_reason || '当前无法编辑此帖子');
            nav(postPath(editId!, limits));
            return;
          }
          const loadedBoardId = String(post.board_id);
          const serverBaseline: ComposeBaseline = {
            title: post.title,
            tags: post.tags ?? '',
            content: post.content ?? '',
            boardId: loadedBoardId,
          };
          setBoardId(loadedBoardId);
          setBaseline(serverBaseline);

          const windowHours = postData.post_edit_window_hours ?? 0;
          if (user.role !== 'admin' && windowHours > 0) {
            setEditWindowHint(formatEditRemaining(post.created_at, windowHours));
          } else {
            setEditWindowHint('');
          }

          const draft = loadComposeDraft(editId);
          const useDraft = draft
            && draftHasContent(draft)
            && (
              draft.title !== serverBaseline.title
              || draft.tags !== serverBaseline.tags
              || draft.content !== serverBaseline.content
            );
          if (useDraft && draft) {
            setTitle(draft.title);
            setTags(draft.tags);
            setContent(draft.content);
            setDraftHint('已恢复未保存的编辑草稿');
            notify.success('已恢复未保存的编辑草稿');
          } else {
            setTitle(serverBaseline.title);
            setTags(serverBaseline.tags);
            setContent(serverBaseline.content);
            setDraftHint('');
          }
          draftReadyRef.current = true;
        })
        .catch((e: unknown) => {
          notify.error(e instanceof Error ? e.message : '加载帖子失败');
          nav('/');
        })
        .finally(() => setLoading(false));
      return;
    }

    draftReadyRef.current = false;
    const applyNewBaseline = (list: Board[], initialBoardId: string) => {
      setBoards(list);
      if (!defaultBoard) setBoardId(initialBoardId);
      const boardForBaseline = defaultBoard || initialBoardId;
      setBoardId(prev => prev || boardForBaseline);

      const draft = loadComposeDraft(null);
      if (draft && draftHasContent(draft)) {
        setTitle(draft.title);
        setTags(draft.tags);
        setContent(draft.content);
        if (draft.boardId && list.some(b => String(b.id) === draft.boardId)) {
          setBoardId(draft.boardId);
        }
        setBaseline({
          title: '',
          tags: '',
          content: '',
          boardId: draft.boardId || boardForBaseline,
        });
        setDraftHint('已恢复本地草稿');
        notify.success('已恢复本地草稿');
      } else {
        setBaseline({
          title: '',
          tags: '',
          content: '',
          boardId: boardForBaseline,
        });
        setDraftHint('');
      }
      draftReadyRef.current = true;
    };

    const list = resolveBoards(layoutCtx?.boards);
    if (list.length > 0) {
      const initialBoardId = defaultBoard || String(list[0].id);
      applyNewBaseline(list, initialBoardId);
      setBoardsReady(true);
      return;
    }

    setBoardsReady(false);
    api.boards().then(d => {
      const next = d.boards ?? [];
      const initialBoardId = defaultBoard || (next.length > 0 ? String(next[0].id) : '');
      applyNewBaseline(next, initialBoardId);
    }).catch(() => {
      setBoards([]);
    }).finally(() => setBoardsReady(true));
  }, [user, authLoading, nav, defaultBoard, isEdit, editId, layoutCtx?.boards]);

  // 防抖自动保存草稿
  useEffect(() => {
    if (!draftReadyRef.current || !user) return;
    clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveComposeDraft(isEdit ? editId : null, {
        title,
        tags,
        content,
        boardId,
      });
      if (title.trim() || tags.trim() || content.trim()) {
        setDraftHint('草稿已自动保存');
      }
    }, 800);
    return () => clearTimeout(draftTimerRef.current);
  }, [title, tags, content, boardId, isEdit, editId, user]);

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return (
      title !== baseline.title
      || serializeTags(parseTags(tags)) !== serializeTags(parseTags(baseline.tags))
      || content !== baseline.content
      || boardId !== baseline.boardId
    );
  }, [baseline, title, tags, content, boardId]);

  const {
    dialogOpen,
    stayOnPage,
    discardAndLeave,
    requestLeave,
    markSaved,
  } = useUnsavedChangesGuard({ isDirty });

  if (authLoading) {
    return (
      <div className="compose-page compose-page--empty">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  if (loading || (!isEdit && !boardsReady)) {
    return (
      <div className="compose-page compose-page--empty">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isEdit && boards.length === 0) {
    return (
      <div className="compose-page compose-page--empty">
        <div className="compose-empty-card">
          <div className="compose-empty-icon" aria-hidden>
            <Pencil size={28} strokeWidth={1.5} />
          </div>
          <h2>暂无可发帖板块</h2>
          <p>需要管理员先创建板块后才能发布内容</p>
          {user.role === 'admin' ? (
            <button type="button" className="compose-primary-btn" onClick={() => nav('/admin/boards')}>
              去创建板块
            </button>
          ) : (
            <button type="button" className="compose-ghost-btn" onClick={() => nav('/')}>
              返回首页
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!boardId) { notify.warning('请选择板块'); return; }
    if (!trimmedTitle) { notify.warning('请输入标题'); return; }
    if (isHtmlEmpty(content)) { notify.warning('请输入正文内容'); return; }

    setPublishing(true);
    try {
      const payload = {
        title: trimmedTitle,
        content: content.trim(),
        tags: serializeTags(parseTags(tags)),
        board_id: boardId,
      };
      if (isEdit) {
        await api.updatePost(editId!, payload);
        notify.success(user?.role === 'admin' ? '帖子已更新' : '已更新并重新提交审核');
        clearComposeDraft(editId);
        markSaved();
        nav(postPath(editId!, limits));
      } else {
        const res = await api.createPost(payload);
        notify.success(res.message || (res.status === 'pending' ? '已提交审核' : '发帖成功'));
        clearComposeDraft(null);
        markSaved();
        nav(postPath(res.post_id, limits));
      }
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : isEdit ? '保存失败' : '发帖失败');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="compose-page">
      <div className="compose-canvas">
        <div className="compose-shell">
          <header className="compose-header">
            <div className="compose-header-left">
              <button
                type="button"
                className="compose-back"
                onClick={() => requestLeave(() => {
                  if (isEdit) nav(postPath(editId!, limits));
                  else nav(-1);
                })}
              >
                <ArrowLeft size={16} />
                <span>返回</span>
              </button>
              <h1 className="compose-header-title">{isEdit ? '编辑帖子' : '写新帖'}</h1>
              {(draftHint || editWindowHint) && (
                <span className="compose-draft-hint" title={editWindowHint || draftHint}>
                  {editWindowHint || draftHint}
                </span>
              )}
            </div>
            <div className="compose-header-actions">
              <button
                type="button"
                className="compose-publish-btn"
                disabled={publishing}
                onClick={handleSubmit}
              >
                <Send size={16} />
                {publishing ? (isEdit ? '保存中…' : '发布中…') : (isEdit ? '保存修改' : '发布')}
              </button>
            </div>
          </header>

          <section className="compose-context" aria-label="发布设置">
            <div className="compose-context-row">
              <span className="compose-context-label">板块</span>
              <div className="compose-board-pills" role="listbox" aria-label={isEdit ? '修改板块' : '选择板块'}>
                {boards.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    role="option"
                    aria-selected={String(b.id) === boardId}
                    className={`compose-board-pill${String(b.id) === boardId ? ' active' : ''}`}
                    onClick={() => setBoardId(String(b.id))}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="compose-context-row compose-context-row--tags">
              <span className="compose-context-label">标签</span>
              <TagInput
                value={tags}
                onChange={setTags}
                placeholder="添加标签，回车确认"
                maxLength={limits.post_tags_max > 0 ? limits.post_tags_max : undefined}
              />
            </div>
          </section>

          <div className="compose-document">
            <input
              className="compose-title"
              type="text"
              placeholder="输入文章标题…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={limits.post_title_max > 0 ? limits.post_title_max : undefined}
            />
            <ArticleEditor
              value={content}
              onChange={setContent}
              placeholder="开始写作。按回车分段，选中文字后用工具栏设置格式。"
            />
          </div>
        </div>
      </div>
      <UnsavedChangesDialog
        open={dialogOpen}
        onStay={stayOnPage}
        onLeave={discardAndLeave}
        isEdit={isEdit}
      />
    </div>
  );
}
