import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Tag } from 'lucide-react';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { Board } from '../api/types';
import { isHtmlEmpty } from '../utils/postContent';
import { useForumLimits } from '../hooks/useForumLimits';
import ArticleEditor from '../components/ArticleEditor';
import { Spinner } from '@/components/ui/spinner';

export default function ComposePage() {
  const nav = useNavigate();
  const { id: editIdParam } = useParams();
  const editId = editIdParam ? Number(editIdParam) : null;
  const isEdit = editId !== null && !Number.isNaN(editId);
  const [params] = useSearchParams();
  const defaultBoard = params.get('board') || '';
  const { user, loading: authLoading } = useAuth();
  const { limits } = useForumLimits();

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState(defaultBoard);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login'); return; }

    if (isEdit) {
      setLoading(true);
      Promise.all([api.boards(), api.post(editId!, { skipView: true })])
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
          setBoardId(String(post.board_id));
          setTitle(post.title);
          setTags(post.tags ?? '');
          setContent(post.content ?? '');
        })
        .catch((e: unknown) => {
          notify.error(e instanceof Error ? e.message : '加载帖子失败');
          nav('/');
        })
        .finally(() => setLoading(false));
      return;
    }

    api.boards().then(d => {
      const list = d.boards ?? [];
      setBoards(list);
      if (!defaultBoard && list.length > 0) {
        setBoardId(String(list[0].id));
      }
    }).catch(() => {});
  }, [user, authLoading, nav, defaultBoard, isEdit, editId]);

  if (authLoading) {
    return (
      <div className="compose-page compose-page--empty">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  if (loading) {
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
          <div className="compose-empty-icon">✎</div>
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
        tags: tags.trim(),
      };
      if (isEdit) {
        await api.updatePost(editId!, payload);
        notify.success('帖子已更新');
        nav(`/post/${editId}`);
      } else {
        const res = await api.createPost({ board_id: boardId, ...payload });
        notify.success('发帖成功');
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
          <button type="button" className="compose-back" onClick={() => nav(isEdit ? `/post/${editId}` : -1)}>
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
          <div className="compose-tags-field">
            <Tag className="compose-tags-icon" size={16} />
            <input
              type="text"
              placeholder="添加标签，逗号分隔"
              value={tags}
              onChange={e => setTags(e.target.value)}
              maxLength={limits.post_tags_max > 0 ? limits.post_tags_max : undefined}
            />
          </div>
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
    </div>
  );
}
