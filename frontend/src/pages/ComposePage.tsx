import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useParams, useOutletContext } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { Board } from '../api/types';
import { isHtmlEmpty } from '../utils/postContent';
import { useForumLimits } from '../hooks/useForumLimits';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
import { serializeTags, parseTags } from '../components/TagInput';
import { Spinner } from '@/components/ui/spinner';
import ComposeHeader from '../components/compose/ComposeHeader';
import ComposeContextBar, { type PostType } from '../components/compose/ComposeContextBar';
import ComposeDocument from '../components/compose/ComposeDocument';
import { getCachedBoards } from '../utils/layoutCache';
import type { LayoutCtx } from '../layouts/MainLayout';
import { loginPath } from '../utils/authRedirect';
import { useNoIndexSEO } from '../hooks/usePageSEO';
import { parsePermalinkID, postPath } from '../utils/permalink';
import { skipsModeration } from '../utils/userMeta';
import {
  clearComposeDraft,
  composeDraftHasContent,
  loadComposeDraft,
  saveComposeDraft,
} from '../utils/composeDraft';

interface ComposeBaseline {
  title: string;
  tags: string;
  content: string;
  boardId: string;
  postType: PostType;
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
  const [postType, setPostType] = useState<PostType>('normal');
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  /** 新建帖：板块列表是否已就绪（避免请求中误显空态） */
  const [boardsReady, setBoardsReady] = useState(
    () => isEdit || resolveBoards(layoutCtx?.boards).length > 0,
  );
  const [baseline, setBaseline] = useState<ComposeBaseline | null>(null);
  const [editWindowHint, setEditWindowHint] = useState('');
  const [draftHint, setDraftHint] = useState('');
  /** 新建帖：是否已处理过本地草稿恢复 */
  const draftHandledRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      nav(loginPath(isEdit ? `/post/${editId}/edit` : '/compose'));
      return;
    }

    if (isEdit) {
      setLoading(true);
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
          const loadedType = post.post_type === 'question' ? 'question' : 'normal';
          const serverBaseline: ComposeBaseline = {
            title: post.title,
            tags: post.tags ?? '',
            content: post.content ?? '',
            boardId: loadedBoardId,
            postType: loadedType,
          };
          setBoardId(loadedBoardId);
          setBaseline(serverBaseline);
          setTitle(serverBaseline.title);
          setTags(serverBaseline.tags);
          setContent(serverBaseline.content);
          setPostType(loadedType);

          const windowHours = postData.post_edit_window_hours ?? 0;
          if (user.role !== 'admin' && windowHours > 0) {
            setEditWindowHint(formatEditRemaining(post.created_at, windowHours));
          } else {
            setEditWindowHint('');
          }
        })
        .catch((e: unknown) => {
          notify.error(e instanceof Error ? e.message : '加载帖子失败');
          nav('/');
        })
        .finally(() => setLoading(false));
      return;
    }

    const applyNewBaseline = (list: Board[], initialBoardId: string) => {
      setBoards(list);
      const boardForBaseline = defaultBoard || initialBoardId;
      const emptyBaseline: ComposeBaseline = {
        title: '',
        tags: '',
        content: '',
        boardId: boardForBaseline,
        postType: 'normal',
      };

      // 首次进入新建页：若有本地草稿则询问是否恢复
      if (!draftHandledRef.current) {
        draftHandledRef.current = true;
        const draft = loadComposeDraft();
        if (composeDraftHasContent(draft) && draft) {
          const when = new Date(draft.savedAt).toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          });
          const restore = window.confirm(`发现 ${when} 的未发帖草稿，是否恢复？\n选「取消」将丢弃该草稿。`);
          if (restore) {
            const boardIdOk = list.some(b => String(b.id) === draft.boardId)
              ? draft.boardId
              : boardForBaseline;
            setBoardId(boardIdOk);
            setTitle(draft.title);
            setTags(draft.tags);
            setContent(draft.content);
            setPostType(draft.postType);
            setBaseline(emptyBaseline);
            setDraftHint('已恢复本地草稿，编辑中将自动保存');
            return;
          }
          clearComposeDraft();
        }
      }

      setBoardId(prev => prev || boardForBaseline);
      setBaseline(emptyBaseline);
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
  }, [user, authLoading, nav, defaultBoard, isEdit, editId, layoutCtx?.boards, limits]);

  const isDirty = useMemo(() => {
    // 无可发帖板块时不拦截导航（空态页本身没有可保存内容）
    if (!isEdit && boards.length === 0) return false;
    if (!baseline) return false;
    return (
      title !== baseline.title
      || serializeTags(parseTags(tags)) !== serializeTags(parseTags(baseline.tags))
      || content !== baseline.content
      || boardId !== baseline.boardId
      || postType !== baseline.postType
    );
  }, [baseline, title, tags, content, boardId, postType, isEdit, boards.length]);

  // 新建帖：防抖写入本地草稿
  useEffect(() => {
    if (isEdit || !baseline) return;
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      saveComposeDraft({
        title,
        tags: serializeTags(parseTags(tags)),
        content,
        boardId,
        postType,
      });
      setDraftHint('草稿已自动保存到本机');
    }, 800);
    return () => window.clearTimeout(timer);
  }, [isEdit, baseline, isDirty, title, tags, content, boardId, postType]);

  const {
    dialogOpen,
    stayOnPage,
    discardAndLeave: discardAndLeaveRaw,
    requestLeave,
    markSaved,
  } = useUnsavedChangesGuard({ isDirty });

  const discardAndLeave = () => {
    if (!isEdit) clearComposeDraft();
    discardAndLeaveRaw();
  };

  const leaveTo = (path: string) => {
    markSaved();
    nav(path);
  };

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
      <>
        <div className="compose-page compose-page--empty">
          <div className="compose-empty-card">
            <div className="compose-empty-icon" aria-hidden>
              <Pencil size={28} strokeWidth={1.5} />
            </div>
            <h2>暂无可发帖板块</h2>
            <p>需要管理员先创建板块后才能发布内容</p>
            {user.role === 'admin' ? (
              <button type="button" className="compose-primary-btn" onClick={() => leaveTo('/admin/boards')}>
                去创建板块
              </button>
            ) : (
              <button type="button" className="compose-ghost-btn" onClick={() => leaveTo('/')}>
                返回首页
              </button>
            )}
          </div>
        </div>
        <UnsavedChangesDialog
          open={dialogOpen}
          onStay={stayOnPage}
          onLeave={discardAndLeave}
          isEdit={isEdit}
        />
      </>
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
        post_type: postType,
      };
      if (isEdit) {
        await api.updatePost(editId!, payload);
        notify.success(skipsModeration(user) ? '帖子已更新' : '已更新并重新提交审核');
        markSaved();
        nav(postPath(editId!, limits));
      } else {
        const res = await api.createPost(payload);
        clearComposeDraft();
        notify.success(res.message || (res.status === 'pending' ? '已提交审核' : '发帖成功'));
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
          <ComposeHeader
            isEdit={isEdit}
            publishing={publishing}
            editWindowHint={editWindowHint}
            draftHint={draftHint}
            onBack={() => requestLeave(() => {
              if (isEdit) nav(postPath(editId!, limits));
              else nav(-1);
            })}
            onPublish={handleSubmit}
          />

          <div className="compose-shell-body">
            <ComposeDocument
              postType={postType}
              title={title}
              onTitleChange={setTitle}
              content={content}
              onContentChange={setContent}
              limits={limits}
            >
              <ComposeContextBar
                isEdit={isEdit}
                postType={postType}
                onPostTypeChange={setPostType}
                boards={boards}
                boardId={boardId}
                onBoardChange={setBoardId}
                tags={tags}
                onTagsChange={setTags}
                limits={limits}
              />
            </ComposeDocument>
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
