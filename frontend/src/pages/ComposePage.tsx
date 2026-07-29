import { useState, useEffect, useMemo } from 'react';
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

export default function ComposePage() {
  const nav = useNavigate();
  const { id: editIdParam } = useParams();
  const editId = editIdParam ? Number(editIdParam) : null;
  const isEdit = editId !== null && !Number.isNaN(editId);
  const [params] = useSearchParams();
  const defaultBoard = params.get('board') || '';
  const { user, loading: authLoading } = useAuth();
  const { limits } = useForumLimits();
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

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login'); return; }

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
            nav(`/post/${editId}`);
            return;
          }
          if (!postData.can_edit) {
            notify.error(postData.edit_block_reason || '当前无法编辑此帖子');
            nav(`/post/${editId}`);
            return;
          }
          const loadedBoardId = String(post.board_id);
          setBoardId(loadedBoardId);
          setTitle(post.title);
          setTags(post.tags ?? '');
          setContent(post.content ?? '');
          setBaseline({
            title: post.title,
            tags: post.tags ?? '',
            content: post.content ?? '',
            boardId: loadedBoardId,
          });
        })
        .catch((e: unknown) => {
          notify.error(e instanceof Error ? e.message : '加载帖子失败');
          nav('/');
        })
        .finally(() => setLoading(false));
      return;
    }

    const list = resolveBoards(layoutCtx?.boards);
    if (list.length > 0) {
      setBoards(list);
      setBoardsReady(true);
      const initialBoardId = defaultBoard || String(list[0].id);
      if (!defaultBoard) setBoardId(initialBoardId);
      setBaseline({
        title: '',
        tags: '',
        content: '',
        boardId: initialBoardId,
      });
      return;
    }

    setBoardsReady(false);
    api.boards().then(d => {
      const next = d.boards ?? [];
      setBoards(next);
      const initialBoardId = defaultBoard || (next.length > 0 ? String(next[0].id) : '');
      if (!defaultBoard && next.length > 0) {
        setBoardId(initialBoardId);
      }
      setBaseline({
        title: '',
        tags: '',
        content: '',
        boardId: initialBoardId,
      });
    }).catch(() => {
      setBoards([]);
    }).finally(() => setBoardsReady(true));
  }, [user, authLoading, nav, defaultBoard, isEdit, editId, layoutCtx?.boards]);

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return (
      title !== baseline.title
      || serializeTags(parseTags(tags)) !== serializeTags(parseTags(baseline.tags))
      || content !== baseline.content
      || (!isEdit && boardId !== baseline.boardId)
    );
  }, [baseline, title, tags, content, boardId, isEdit]);

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
    if (!isEdit && !boardId) { notify.warning('请选择板块'); return; }
    if (!trimmedTitle) { notify.warning('请输入标题'); return; }
    if (isHtmlEmpty(content)) { notify.warning('请输入正文内容'); return; }

    setPublishing(true);
    try {
      const payload = {
        title: trimmedTitle,
        content: content.trim(),
        tags: serializeTags(parseTags(tags)),
      };
      if (isEdit) {
        await api.updatePost(editId!, payload);
        notify.success('帖子已更新');
        markSaved();
        nav(`/post/${editId}`);
      } else {
        const res = await api.createPost({ board_id: boardId, ...payload });
        notify.success('发帖成功');
        markSaved();
        nav(`/post/${res.post_id}`);
      }
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : isEdit ? '保存失败' : '发帖失败');
    } finally {
      setPublishing(false);
    }
  };

  const currentBoard = boards.find(b => String(b.id) === boardId);

  return (
    <div className="compose-page">
      <div className="compose-canvas">
        <header className="compose-header">
          <button
            type="button"
            className="compose-back"
            onClick={() => requestLeave(() => nav(isEdit ? `/post/${editId}` : -1))}
          >
            <ArrowLeft size={16} />
            <span>返回</span>
          </button>
          <div className="compose-header-actions">
            <button
              type="button"
              className="compose-publish-btn"
              disabled={publishing}
              onClick={handleSubmit}
            >
              <Send size={16} />
              {publishing ? (isEdit ? '保存中…' : '发布中…') : (isEdit ? '保存修改' : '发布帖子')}
            </button>
          </div>
        </header>

        <div className="compose-meta">
          {!isEdit ? (
            <div className="compose-board-pills">
              {boards.map(b => (
                <button
                  key={b.id}
                  type="button"
                  className={`compose-board-pill${String(b.id) === boardId ? ' active' : ''}`}
                  onClick={() => setBoardId(String(b.id))}
                >
                  {b.name}
                </button>
              ))}
            </div>
          ) : currentBoard && (
            <div className="compose-board-pills">
              <span className="compose-board-pill active">{currentBoard.name}</span>
            </div>
          )}
          <TagInput
            value={tags}
            onChange={setTags}
            placeholder="输入标签后回车"
            maxLength={limits.post_tags_max > 0 ? limits.post_tags_max : undefined}
          />
        </div>

        <div className="compose-writing">
          <input
            className="compose-title"
            type="text"
            placeholder="输入文章标题…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={limits.post_title_max > 0 ? limits.post_title_max : undefined}
          />
          {currentBoard && (
            <div className="compose-subtitle">
              {isEdit ? '编辑于' : '发布至'} <strong>{currentBoard.name}</strong>
            </div>
          )}
          <ArticleEditor
            value={content}
            onChange={setContent}
            placeholder="开始写作。所见即所得，选中文字后使用工具栏设置格式。"
          />
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
