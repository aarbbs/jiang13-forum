import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, Star, Pencil, Pin, History, Lock, MessageSquare, FileQuestion, Trash2 } from 'lucide-react';
import PinnedIcon from '@/components/PinnedIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BoardBadge from '@/components/BoardBadge';
import UserLink from '@/components/UserLink';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem, Comment } from '../api/types';
import CommentThreadList from '../components/CommentThreadList';
import CommentBox, { type CommentSubmitData } from '../components/CommentBox';
import PostContent from '../components/PostContent';
import PostRevisionPanel from '../components/PostRevisionPanel';
import ArticleOutline from '../components/ArticleOutline';
import { useAuth } from '../hooks/useAuth';
import { formatDateTime, isTimeDiffSignificant } from '../utils/content';
import { loadMyCommentIds, addMyCommentId } from '../utils/guest';
import { clearAllFeedCache } from '../utils/feedCache';
import { useGlobalWheelScroll } from '../hooks/useGlobalWheelScroll';
import { loginPath } from '../utils/authRedirect';
import type { LayoutCtx } from '../layouts/MainLayout';
import type { PostHeading } from '../utils/postHeadings';

/** 格式化剩余可编辑时间 */
function formatEditRemaining(createdAt: string, windowHours: number): string {
  if (windowHours <= 0) return '';
  const deadline = new Date(createdAt).getTime() + windowHours * 3600_000;
  const ms = deadline - Date.now();
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3600_000);
  const mins = Math.floor((ms % 3600_000) / 60_000);
  if (hours >= 24) return `还可编辑约 ${Math.floor(hours / 24)} 天`;
  if (hours > 0) return `还可编辑约 ${hours} 小时`;
  return `还可编辑约 ${mins} 分钟`;
}

export default function PostDetailPage() {
  const { id } = useParams();
  const postId = Number(id);
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const { setPostOutline, isMobile } = useOutletContext<LayoutCtx>();

  const [post, setPost] = useState<PostItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [highlightFloor, setHighlightFloor] = useState<number | null>(null);
  const [submitCount, setSubmitCount] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [editBlockReason, setEditBlockReason] = useState('');
  const [editWindowHours, setEditWindowHours] = useState(0);
  const [showRevisions, setShowRevisions] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [headings, setHeadings] = useState<PostHeading[]>([]);

  const pageRef = useRef<HTMLDivElement>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const commentBoxRef = useRef<HTMLDivElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();

  useGlobalWheelScroll(pageRef, !loading && !!post);

  const handleHeadingsChange = useCallback((next: PostHeading[]) => {
    setHeadings(next);
  }, []);

  useEffect(() => {
    if (loading || !post) {
      setPostOutline({ headings: [], scrollRoot: null, title: '文章目录' });
      return () => setPostOutline(null);
    }
    setPostOutline({
      headings,
      scrollRoot: pageRef.current,
      title: '文章目录',
    });
    return () => setPostOutline(null);
  }, [headings, loading, post, setPostOutline]);

  const loadSeq = useRef(0);
  const postPath = `/post/${postId}`;

  useEffect(() => {
    if (!postId) return;
    setReplyTo(null);
    setEditingCommentId(null);
    setHeadings([]);
    const seq = ++loadSeq.current;
    setLoading(true);
    setPost(null);

    (async () => {
      try {
        const myIds = user ? [] : loadMyCommentIds();
        const [detail, comm] = await Promise.all([
          api.post(postId),
          api.comments(postId, myIds),
        ]);
        if (seq !== loadSeq.current) return;
        setPost(detail.post);
        setLiked(detail.liked);
        setFavorited(detail.favorited);
        setCanEdit(detail.can_edit ?? false);
        setIsEdited(detail.is_edited ?? isTimeDiffSignificant(detail.post.created_at, detail.post.updated_at ?? detail.post.created_at));
        setEditBlockReason(detail.edit_block_reason ?? '');
        setEditWindowHours(detail.post_edit_window_hours ?? 0);
        setComments(Array.isArray(comm.comments) ? comm.comments : []);
        void refresh();
      } catch (e: unknown) {
        if (seq !== loadSeq.current) return;
        setPost(null);
        notify.error(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 postId 变化时加载
  }, [postId]);

  const reloadComments = useCallback(async () => {
    const myIds = user ? [] : loadMyCommentIds();
    const comm = await api.comments(postId, myIds);
    setComments(Array.isArray(comm.comments) ? comm.comments : []);
  }, [postId, user]);

  const jumpToFloor = useCallback((floor: number) => {
    const el = document.getElementById(`floor-${floor}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightFloor(floor);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightFloor(null), 2000);
  }, []);

  const requireLogin = (actionLabel: string) => {
    notify.warning(`登录后即可${actionLabel}`);
    nav(loginPath(postPath));
  };

  const handleReplyTo = (comment: Comment) => {
    setEditingCommentId(null);
    if (replyTo?.id === comment.id) {
      setReplyTo(null);
      return;
    }
    setReplyTo(comment);
  };

  useLayoutEffect(() => {
    if (!replyTo) return;
    const el = document.getElementById(`reply-box-${replyTo.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [replyTo?.id]);

  useEffect(() => {
    return () => clearTimeout(highlightTimer.current);
  }, []);

  const handleLike = async () => {
    if (!user) { requireLogin('点赞'); return; }
    try {
      const r = await api.like(postId);
      setLiked(r.liked);
      setPost(p => p ? { ...p, like_count: r.like_count } : p);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleFavorite = async () => {
    if (!user) { requireLogin('收藏'); return; }
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
      await reloadComments();
      setTimeout(() => jumpToFloor(r.floor), 100);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveComment = async (comment: Comment, content: string) => {
    try {
      const r = await api.updateComment(comment.id, content);
      setComments(list => list.map(c => (
        c.id === comment.id
          ? { ...c, content: r.content || content, updated_at: new Date().toISOString() }
          : c
      )));
      setEditingCommentId(null);
      notify.success('评论已更新');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
      throw e;
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    try {
      await api.deleteComment(comment.id);
      setComments(list => list.filter(c => c.id !== comment.id));
      if (replyTo?.id === comment.id) setReplyTo(null);
      if (editingCommentId === comment.id) setEditingCommentId(null);
      notify.success('评论已删除');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
      throw e;
    }
  };

  const handleDeletePost = async () => {
    setDeletingPost(true);
    try {
      await api.deletePost(postId);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success('帖子已删除');
      nav('/', { replace: true });
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeletingPost(false);
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
      <FileQuestion className="empty-state-icon" aria-hidden size={36} strokeWidth={1.5} />
      <p>帖子不存在</p>
      <Button variant="outline" onClick={() => nav('/')}>返回首页</Button>
    </div>
  );

  const authorInitial = post.user?.nickname?.[0] || '?';
  const tags = post.tags?.split(/[,，]/).map(t => t.trim()).filter(Boolean) ?? [];
  const isOwnerOrAdmin = !!(user && (user.role === 'admin' || user.id === post.user_id));
  const isAdmin = user?.role === 'admin';
  const showEdited = isEdited && post.updated_at;
  const editRemaining = canEdit && user?.role !== 'admin'
    ? formatEditRemaining(post.created_at, editWindowHours)
    : '';

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
            <UserLink
              user={post.user}
              showAvatar={false}
              showName={false}
              className="post-avatar post-avatar-lg user-link--avatar-only"
            >
              {post.user?.avatar
                ? <img src={post.user.avatar} alt="" loading="lazy" decoding="async" />
                : authorInitial}
            </UserLink>
            <div className="post-detail-author-info">
              <UserLink user={post.user} className="post-detail-author-name" />
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

        {isMobile && headings.length > 0 && (
          <details className="post-detail-toc-mobile">
            <summary>文章目录（{headings.length}）</summary>
            <ArticleOutline
              headings={headings}
              scrollRoot={pageRef.current}
              title="目录"
            />
          </details>
        )}

        <PostContent
          html={post.content || ''}
          isLoggedIn={!!user}
          onHeadingsChange={handleHeadingsChange}
        />

        <div className="post-detail-actions">
          <Button
            variant={liked ? 'default' : 'outline'}
            size="sm"
            onClick={handleLike}
            title={!user ? '登录后可点赞' : undefined}
            className={!user ? 'post-action-guest' : undefined}
          >
            <ThumbsUp />
            点赞 {post.like_count}
          </Button>
          <Button
            variant={favorited ? 'default' : 'outline'}
            size="sm"
            onClick={handleFavorite}
            title={!user ? '登录后可收藏' : undefined}
            className={!user ? 'post-action-guest' : undefined}
          >
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
          {isOwnerOrAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={deletingPost}>
                  <Trash2 />
                  删除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确定删除该帖子？</AlertDialogTitle>
                  <AlertDialogDescription>相关评论也将一并删除，不可恢复。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeletePost}>删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {editRemaining && (
            <span className="post-detail-edit-hint">{editRemaining}</span>
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
              <MessageSquare className="comment-empty-icon" aria-hidden size={32} strokeWidth={1.5} />
              <p>暂无评论，来抢沙发吧</p>
            </div>
          ) : (
            <CommentThreadList
              comments={comments}
              highlightFloor={highlightFloor}
              replyToId={replyTo?.id ?? null}
              editingId={editingCommentId}
              currentUser={user}
              onReply={handleReplyTo}
              onCancelReply={() => setReplyTo(null)}
              onStartEdit={(c) => {
                setReplyTo(null);
                setEditingCommentId(c.id);
              }}
              onCancelEdit={() => setEditingCommentId(null)}
              onSaveEdit={handleSaveComment}
              onDelete={handleDeleteComment}
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
