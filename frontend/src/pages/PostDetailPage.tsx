import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, Star, Pencil, Pin, History, Lock } from 'lucide-react';
import PinnedIcon from '@/components/PinnedIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BoardBadge from '@/components/BoardBadge';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem, Comment } from '../api/types';
import CommentThreadList from '../components/CommentThreadList';
import CommentBox, { type CommentSubmitData } from '../components/CommentBox';
import PostContent from '../components/PostContent';
import PostRevisionPanel from '../components/PostRevisionPanel';
import { useAuth } from '../hooks/useAuth';
import { formatDateTime, isTimeDiffSignificant } from '../utils/content';
import { loadMyCommentIds, addMyCommentId } from '../utils/guest';
import { clearAllFeedCache } from '../utils/feedCache';
import { useGlobalWheelScroll } from '../hooks/useGlobalWheelScroll';

export default function PostDetailPage() {
  const { id } = useParams();
  const postId = Number(id);
  const nav = useNavigate();
  const { user, refresh } = useAuth();

  const [post, setPost] = useState<PostItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [highlightFloor, setHighlightFloor] = useState<number | null>(null);
  const [submitCount, setSubmitCount] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [editBlockReason, setEditBlockReason] = useState('');
  const [showRevisions, setShowRevisions] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const commentBoxRef = useRef<HTMLDivElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();

  useGlobalWheelScroll(pageRef, !loading && !!post);

  const fetchComments = useCallback(async () => {
    const myIds = user ? [] : loadMyCommentIds();
    const comm = await api.comments(postId, myIds);
    return Array.isArray(comm.comments) ? comm.comments : [];
  }, [postId, user]);

  const load = async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const [detail, commList] = await Promise.all([
        api.post(postId),
        fetchComments(),
      ]);
      setPost(detail.post);
      setLiked(detail.liked);
      setFavorited(detail.favorited);
      setCanEdit(detail.can_edit ?? false);
      setIsEdited(detail.is_edited ?? isTimeDiffSignificant(detail.post.created_at, detail.post.updated_at ?? detail.post.created_at));
      setEditBlockReason(detail.edit_block_reason ?? '');
      setComments(commList);
      await refresh();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setReplyTo(null);
    load();
  }, [postId]);

  const jumpToFloor = useCallback((floor: number) => {
    const el = document.getElementById(`floor-${floor}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightFloor(floor);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightFloor(null), 2000);
  }, []);

  const handleReplyTo = (comment: Comment) => {
    if (replyTo?.id === comment.id) {
      setReplyTo(null);
      return;
    }
    setReplyTo(comment);
  };

  // DOM 提交后再滚动，避免 setTimeout 与 focus 抢滚动导致概率性错位
  useLayoutEffect(() => {
    if (!replyTo) return;
    const el = document.getElementById(`reply-box-${replyTo.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [replyTo?.id]);

  useEffect(() => {
    return () => clearTimeout(highlightTimer.current);
  }, []);

  const handleLike = async () => {
    if (!user) { nav('/login'); return; }
    try {
      const r = await api.like(postId);
      setLiked(r.liked);
      setPost(p => p ? { ...p, like_count: r.like_count } : p);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleFavorite = async () => {
    if (!user) { nav('/login'); return; }
    try {
      const r = await api.favorite(postId);
      setFavorited(r.favorited);
      notify.success(r.favorited ? '已收藏' : '已取消收藏');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleSubmitComment = async (data: CommentSubmitData) => {
    setSubmitting(true);
    try {
      const r = await api.addComment(postId, {
        content: data.content,
        replyTo: replyTo?.id,
        guestNick: data.guestNick,
        guestEmail: data.guestEmail,
        guestUrl: data.guestUrl,
        isPrivate: data.isPrivate,
      });
      if (!user) addMyCommentId(r.id);
      setReplyTo(null);
      setSubmitCount(c => c + 1);
      notify.success('评论成功');
      setComments(await fetchComments());
      setTimeout(() => jumpToFloor(r.floor), 100);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const commentBoxProps = {
    user,
    submitting,
    submitCount,
    onSubmit: handleSubmitComment,
    onCancelReply: () => setReplyTo(null),
  };

  if (loading) return <div className="post-detail-loading flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!post) return (
    <div className="empty-state">
      <p>帖子不存在</p>
      <Button variant="outline" onClick={() => nav('/')}>返回首页</Button>
    </div>
  );

  const authorInitial = post.user?.nickname?.[0] || '?';
  const tags = post.tags?.split(/[,，]/).map(t => t.trim()).filter(Boolean) ?? [];
  const isOwnerOrAdmin = user && (user.role === 'admin' || user.id === post.user_id);
  const isAdmin = user?.role === 'admin';
  const showEdited = isEdited && post.updated_at;

  const handlePin = async () => {
    if (!post) return;
    try {
      const r = await api.adminPinPost(postId, !post.pinned);
      setPost(p => p ? { ...p, pinned: r.pinned } : p);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleLock = async () => {
    if (!post) return;
    try {
      const r = await api.adminLockPost(postId, !post.edit_locked);
      setPost(p => p ? { ...p, edit_locked: r.edit_locked } : p);
      if (user?.role === 'admin') {
        setCanEdit(true);
      } else if (user?.id === post.user_id && r.edit_locked) {
        setCanEdit(false);
        setEditBlockReason('帖子已被管理员锁定，无法编辑');
      }
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  return (
    <div className="page-wrap post-detail-page" ref={pageRef}>
      <div className="post-detail-header">
        <div className="post-detail-nav">
          <Button variant="ghost" size="sm" onClick={() => nav(-1)}>
            <ArrowLeft />
            返回
          </Button>
          {post.board && (
            <BoardBadge board={post.board} className="post-detail-board-tag" />
          )}
        </div>

        <div className="post-detail-head">
          <h1 className="post-detail-title">
            {post.pinned && <PinnedIcon className="mr-2" size={18} />}
            {post.title}
          </h1>
          <div className="post-detail-author-row">
            <div className="post-avatar post-avatar-lg">
              {post.user?.avatar ? <img src={post.user.avatar} alt="" /> : authorInitial}
            </div>
            <div className="post-detail-author-info">
              <span className="post-detail-author-name">{post.user?.nickname}</span>
              <span className="post-detail-meta-line">
                发布于 {formatDateTime(post.created_at)}
                {showEdited && (
                  <> · 编辑于 {formatDateTime(post.updated_at!)}</>
                )}
                {' · '}{post.view_count} 次浏览
                {post.edit_locked && (
                  <span className="post-detail-locked-tag" title="管理员已锁定编辑">
                    <Lock size={12} /> 已锁定
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="post-detail-tags">
            {tags.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
          </div>
        )}

        <PostContent html={post.content || ''} isLoggedIn={!!user} />

        <div className="post-detail-actions">
          <Button variant={liked ? 'default' : 'outline'} size="sm" onClick={handleLike}>
            <ThumbsUp />
            点赞 {post.like_count}
          </Button>
          <Button variant={favorited ? 'default' : 'outline'} size="sm" onClick={handleFavorite}>
            <Star />
            {favorited ? '已收藏' : '收藏'}
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => nav(`/post/${postId}/edit`)}>
              <Pencil />
              编辑
            </Button>
          )}
          {isOwnerOrAdmin && isEdited && (
            <Button variant="outline" size="sm" onClick={() => setShowRevisions(true)}>
              <History />
              编辑历史
            </Button>
          )}
          {isOwnerOrAdmin && !canEdit && editBlockReason && (
            <span className="post-detail-edit-hint" title={editBlockReason}>
              {editBlockReason}
            </span>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={handlePin}>
                <Pin />
                {post.pinned ? '取消置顶' : '置顶'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleLock}>
                <Lock />
                {post.edit_locked ? '解锁编辑' : '锁定编辑'}
              </Button>
            </>
          )}
        </div>
      </div>

      <PostRevisionPanel
        postId={postId}
        currentPost={{ title: post.title, content: post.content ?? '', tags: post.tags ?? '' }}
        open={showRevisions}
        onClose={() => setShowRevisions(false)}
        isLoggedIn={!!user}
      />

      <div className="comment-section" ref={commentSectionRef}>
        <div className="comment-section-bar">
          <span className="comment-section-title">评论区</span>
          <span className="comment-section-count">{comments.length} 条评论</span>
        </div>

        {!replyTo && (
          <div className="comment-box-wrap" ref={commentBoxRef}>
            <CommentBox {...commentBoxProps} />
          </div>
        )}

        <div className="comment-list-area">
          {comments.length === 0 && !replyTo ? (
            <div className="comment-empty">
              <div className="comment-empty-icon">💬</div>
              <p>暂无评论，来抢沙发吧</p>
            </div>
          ) : (
            <CommentThreadList
              comments={comments}
              highlightFloor={highlightFloor}
              replyToId={replyTo?.id ?? null}
              onReply={handleReplyTo}
              onCancelReply={() => setReplyTo(null)}
              renderReplyBox={(c) => (
                <CommentBox
                  key={c.id}
                  {...commentBoxProps}
                  replyTo={c}
                  inline
                />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
