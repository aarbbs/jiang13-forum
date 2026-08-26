import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, Star, Pencil, Pin, History, Lock, LockOpen, MessageSquare, MessageSquareOff, Trash2, Sparkles, Flag, Ban, CircleCheck, CircleHelp, MoreHorizontal } from 'lucide-react';
import FeaturedIcon from '@/components/FeaturedIcon';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem, Comment, ReportReason, PollView, PostLotteryView } from '../api/types';
import { REPORT_REASON_OPTIONS } from '../utils/report';
import CommentThreadList from '../components/CommentThreadList';
import CommentBox, { type CommentSubmitData } from '../components/CommentBox';
import PostContent from '../components/PostContent';
import PostPollCard from '../components/PostPollCard';
import PostBountyBanner from '../components/PostBountyBanner';
import { findCommentFloor } from '../utils/bounty';
import PostLotteryCard from '../components/PostLotteryCard';
import PostRevisionPanel from '../components/PostRevisionPanel';
import ArticleOutline from '../components/ArticleOutline';
import { useAuth } from '../hooks/useAuth';
import { joinSEOKeywords, usePageSEO } from '../hooks/usePageSEO';
import { getCachedSiteBranding } from '../hooks/useSiteBranding';
import { formatDateTime, isTimeDiffSignificant } from '../utils/content';
import { collectCommentSubtreeIds } from '../utils/comment';
import { loadMyCommentIds } from '../utils/guest';
import { clearAllFeedCache } from '../utils/feedCache';
import { useGlobalWheelScroll } from '../hooks/useGlobalWheelScroll';
import { loginPath } from '../utils/authRedirect';
import { excerptFromHTML, firstImageFromHTML } from '../utils/seoText';
import { canonicalRedirectPath, parsePermalinkID, postPath } from '../utils/permalink';
import { useForumLimits } from '../hooks/useForumLimits';
import type { LayoutCtx } from '../layouts/MainLayout';
import type { PostHeading } from '../utils/postHeadings';
import { InFlowSiteFooter } from '../components/SiteFooter';
import NotFoundPage from './NotFoundPage';

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
  const postId = parsePermalinkID(id);
  const nav = useNavigate();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const { limits } = useForumLimits();
  const { setPostOutline, isMobile } = useOutletContext<LayoutCtx>();

  const [post, setPost] = useState<PostItem | null>(null);
  const [poll, setPoll] = useState<PollView | null>(null);
  const [lottery, setLottery] = useState<PostLotteryView | null>(null);
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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportDetail, setReportDetail] = useState('');
  const [reporting, setReporting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [bountyAwardTarget, setBountyAwardTarget] = useState<number | null>(null);
  const [bountyAwarding, setBountyAwarding] = useState(false);
  const [bountyCanRefund, setBountyCanRefund] = useState(true);
  const [bountyRefundBlockReason, setBountyRefundBlockReason] = useState('');
  const [bountyEligibleReplyCount, setBountyEligibleReplyCount] = useState(0);

  const pageRef = useRef<HTMLDivElement>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const commentBoxRef = useRef<HTMLDivElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();

  useGlobalWheelScroll(pageRef, !loading && !!post);

  // SPA 内跳转时纠正非规范伪静态路径
  useEffect(() => {
    if (!postId || Number.isNaN(postId)) return;
    const target = canonicalRedirectPath('post', postId, location.pathname, limits);
    if (target) nav(target + location.search + location.hash, { replace: true });
  }, [postId, location.pathname, location.search, location.hash, limits, nav]);

  const brand = getCachedSiteBranding();
  const postContent = post?.content ?? '';
  const postSEO = post ? {
    title: post.title,
    description: excerptFromHTML(postContent),
    keywords: joinSEOKeywords(post.board?.name, brand.keywords),
    canonicalPath: postPath(post.id, limits),
    ogType: 'article',
    ogImage: firstImageFromHTML(postContent) || post.user?.avatar || brand.og_image || '',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      headline: post.title,
      description: excerptFromHTML(postContent),
      datePublished: post.created_at,
      dateModified: post.updated_at || post.created_at,
      url: postPath(post.id, limits),
      author: {
        '@type': 'Person',
        name: post.user?.nickname || post.user?.username || '',
      },
    },
  } : null;
  usePageSEO(postSEO);

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
      author: post.user ?? null,
      publishedAt: post.created_at,
      viewCount: post.view_count,
    });
    return () => setPostOutline(null);
  }, [headings, loading, post, setPostOutline]);

  const loadSeq = useRef(0);
  const detailPath = postPath(postId, limits);

  useEffect(() => {
    if (!postId || Number.isNaN(postId)) {
      setPost(null);
      setLoading(false);
      return;
    }
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
        setPoll(detail.poll ?? null);
        setLottery(detail.lottery ?? null);
        setLiked(detail.liked);
        setFavorited(detail.favorited);
        setCanEdit(detail.can_edit ?? false);
        setIsEdited(detail.is_edited ?? isTimeDiffSignificant(detail.post.created_at, detail.post.updated_at ?? detail.post.created_at));
        setEditBlockReason(detail.edit_block_reason ?? '');
        setEditWindowHours(detail.post_edit_window_hours ?? 0);
        setBountyCanRefund(detail.bounty_can_refund ?? true);
        setBountyRefundBlockReason(detail.bounty_refund_block_reason ?? '');
        setBountyEligibleReplyCount(detail.bounty_eligible_reply_count ?? 0);
        setComments(Array.isArray(comm.comments) ? comm.comments : []);
        void refresh();
      } catch {
        if (seq !== loadSeq.current) return;
        setPost(null);
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

  /** 发评后重拉正文，解锁「回复可见」区块（跳过浏览计数） */
  const reloadPostContent = useCallback(async () => {
    try {
      const detail = await api.post(postId, { skipView: true });
      setPost(detail.post);
      setPoll(detail.poll ?? null);
      setLottery(detail.lottery ?? null);
      setBountyCanRefund(detail.bounty_can_refund ?? true);
      setBountyRefundBlockReason(detail.bounty_refund_block_reason ?? '');
      setBountyEligibleReplyCount(detail.bounty_eligible_reply_count ?? 0);
    } catch {
      // 评论已成功，正文刷新失败不阻断
    }
  }, [postId]);

  const scrollToCommentBox = useCallback(() => {
    const target = commentBoxRef.current || commentSectionRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      const ta = commentBoxRef.current?.querySelector('textarea');
      ta?.focus({ preventScroll: true });
    }, 320);
  }, []);

  const jumpToFloor = useCallback((floor: number) => {
    const el = document.getElementById(`floor-${floor}`);
    if (!el) return false;

    const root = pageRef.current;
    if (!root) return false;

    // 直接计算目标滚动位置
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const relativeTop = elRect.top - rootRect.top;
    const initialMaxScrollTop = root.scrollHeight - root.clientHeight;
    const targetTop = root.scrollTop + relativeTop - 24;

    // 如果 relativeTop 非常异常（如 NaN 或 Infinity），说明布局可能还没完成
    if (!isFinite(targetTop) || targetTop < -500) return false;

    const clampedTop = Math.max(0, Math.min(targetTop, initialMaxScrollTop));

    // 直接设置滚动位置（不使用平滑滚动，避免动画干扰）
    root.scrollTop = clampedTop;

    // 验证滚动结果，如果不准确则再次调整
    // 注意：使用动态计算的 currentMaxScrollTop，因为评论可能在之后才渲染完成
    const verifyAndFix = () => {
      const currentElRect = el.getBoundingClientRect();
      const currentRootRect = root.getBoundingClientRect();
      const currentRelativeTop = currentElRect.top - currentRootRect.top;
      const currentMaxScrollTop = root.scrollHeight - root.clientHeight;

      // 如果元素在视口内但位置不准确，进行修正
      if (root.scrollTop > 0 && Math.abs(currentRelativeTop - 24) > 10) {
        const correction = currentRelativeTop - 24;
        const newTarget = Math.max(0, Math.min(root.scrollTop + correction, currentMaxScrollTop));
        root.scrollTop = newTarget;
      }
    };

    // 在多个时间点验证和调整
    requestAnimationFrame(verifyAndFix);
    setTimeout(verifyAndFix, 50);
    setTimeout(verifyAndFix, 150);

    setHighlightFloor(floor);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightFloor(null), 2000);
    return true;
  }, []);

  /** 正文标题锚点：滚动容器是 pageRef，原生 hash 定位无效，需手动滚 */
  const jumpToHeadingHash = useCallback((hash: string, smooth = false) => {
    const id = decodeURIComponent((hash || '').replace(/^#/, '')).trim();
    if (!id || /^floor-\d+$/.test(id)) return false;
    const el = document.getElementById(id);
    if (!el) return false;

    const root = pageRef.current;
    if (!root) return false;

    // 直接计算目标滚动位置
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const relativeTop = elRect.top - rootRect.top;
    const initialMaxScrollTop = root.scrollHeight - root.clientHeight;
    const targetTop = root.scrollTop + relativeTop - 12;

    // 如果 relativeTop 非常异常（如 NaN 或 Infinity），说明布局可能还没完成
    if (!isFinite(targetTop) || targetTop < -500) return false;

    const clampedTop = Math.max(0, Math.min(targetTop, initialMaxScrollTop));

    // 直接设置滚动位置
    root.scrollTop = clampedTop;

    // 验证滚动结果，如果不准确则再次调整
    const verifyAndFix = () => {
      const currentElRect = el.getBoundingClientRect();
      const currentRootRect = root.getBoundingClientRect();
      const currentRelativeTop = currentElRect.top - currentRootRect.top;
      const currentMaxScrollTop = root.scrollHeight - root.clientHeight;

      if (root.scrollTop > 0 && Math.abs(currentRelativeTop - 12) > 10) {
        const correction = currentRelativeTop - 12;
        const newTarget = Math.max(0, Math.min(root.scrollTop + correction, currentMaxScrollTop));
        root.scrollTop = newTarget;
      }
    };

    requestAnimationFrame(verifyAndFix);
    if (smooth) {
      setTimeout(verifyAndFix, 50);
      setTimeout(verifyAndFix, 150);
    }

    return true;
  }, []);

  // 从 #floor-N 定位到对应评论（右栏最新评论等入口）；等评论进 DOM 后重试，避免首屏 hash 失效
  useEffect(() => {
    if (loading || !post) return;
    const m = location.hash.match(/^#floor-(\d+)$/);
    if (!m) return;
    const floor = Number(m[1]);
    if (!floor) return;

    let cancelled = false;
    let attempts = 0;
    let timer = 0;

    const tryJump = () => {
      if (cancelled) return;
      if (jumpToFloor(floor)) return;
      attempts += 1;
      if (attempts < 30) {
        timer = window.setTimeout(tryJump, 50);
      }
    };

    timer = window.setTimeout(tryJump, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, post, comments, location.hash, jumpToFloor]);

  // 从 #heading-N（或任意标题 id）定位；等正文进 DOM 后重试，避免首屏 hash 失效
  useEffect(() => {
    if (loading || !post) return;
    const hash = location.hash;
    if (!hash || /^#floor-\d+$/.test(hash)) return;

    let cancelled = false;
    let attempts = 0;
    let timer = 0;

    const tryJump = () => {
      if (cancelled) return;
      if (jumpToHeadingHash(hash, false)) return;
      attempts += 1;
      if (attempts < 30) {
        timer = window.setTimeout(tryJump, 50);
      }
    };

    timer = window.setTimeout(tryJump, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, post, location.hash, jumpToHeadingHash, headings]);

  const requireLogin = (actionLabel: string) => {
    notify.warning(`登录后即可${actionLabel}`);
    nav(loginPath(detailPath));
  };

  const handleReplyTo = (comment: Comment) => {
    if (!user) {
      requireLogin('回复');
      return;
    }
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
    if (!user) {
      requireLogin('评论');
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.addComment(postId, {
        content: data.content,
        replyTo: replyTo?.id,
        isPrivate: data.isPrivate,
      });
      setReplyTo(null);
      setSubmitCount(c => c + 1);
      notify.success(r.message || (r.status === 'pending' ? '评论已提交审核' : '评论成功'));
      await Promise.all([reloadComments(), reloadPostContent()]);
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
          ? {
              ...c,
              content: r.content || content,
              updated_at: new Date().toISOString(),
              status: r.status || c.status,
            }
          : c
      )));
      setEditingCommentId(null);
      notify.success(r.message || '评论已更新');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
      throw e;
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    try {
      await api.deleteComment(comment.id);
      const removeIds = collectCommentSubtreeIds(comments, comment.id);
      setComments(list => list.filter(c => !removeIds.has(c.id)));
      if (replyTo && removeIds.has(replyTo.id)) setReplyTo(null);
      if (editingCommentId != null && removeIds.has(editingCommentId)) setEditingCommentId(null);
      notify.success('评论已移入回收站');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
      throw e;
    }
  };

  const handleApproveComment = async (comment: Comment) => {
    try {
      const r = await api.adminApproveComment(comment.id);
      setComments(list => list.map(c => (
        c.id === comment.id ? { ...c, status: r.status } : c
      )));
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '审核失败');
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
  if (!post) {
    return (
      <NotFoundPage
        title="帖子不存在"
        description="该帖子不存在，或已被删除。"
      />
    );
  }

  const authorInitial = post.user?.nickname?.[0] || '?';
  const tags = post.tags?.split(/[,，]/).map(t => t.trim()).filter(Boolean) ?? [];
  const isOwnerOrAdmin = !!(user && (user.role === 'admin' || user.id === post.user_id));
  const isAdmin = user?.role === 'admin';
  const showEdited = isEdited && post.updated_at;
  const editRemaining = canEdit && user?.role !== 'admin'
    ? formatEditRemaining(post.created_at, editWindowHours)
    : '';

  const handleBountyAward = (commentId: number) => {
    setBountyAwardTarget(commentId);
  };

  const confirmBountyAward = async () => {
    if (bountyAwardTarget == null) return;
    setBountyAwarding(true);
    try {
      await api.bountyAward(post.id, bountyAwardTarget);
      notify.success('悬赏已发放');
      setBountyAwardTarget(null);
      await reloadPostContent();
      await reloadComments();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBountyAwarding(false);
    }
  };
  const awardedCommentFloor = findCommentFloor(comments, post.bounty_comment_id);
  const canJumpToAwarded = awardedCommentFloor != null;

  const handleJumpToAwarded = () => {
    if (awardedCommentFloor != null) jumpToFloor(awardedCommentFloor);
  };

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

  const handleBoardPin = async () => {
    if (!post) return;
    try {
      const r = await api.adminBoardPinPost(postId, !post.board_pinned);
      setPost(p => p ? { ...p, board_pinned: r.board_pinned } : p);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleFeature = async () => {
    if (!post) return;
    try {
      const r = await api.adminFeaturePost(postId, !post.featured);
      setPost(p => p ? { ...p, featured: r.featured } : p);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleToggleResolved = async () => {
    if (!post || post.post_type !== 'question') return;
    const next = !post.question_resolved;
    try {
      const r = await api.setQuestionResolved(postId, next);
      setPost(p => p ? { ...p, question_resolved: r.question_resolved } : p);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleApprove = async () => {
    if (!post) return;
    try {
      const r = await api.adminApprovePost(postId);
      setPost(p => p ? { ...p, status: r.status } : p);
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleReport = async () => {
    if (!user) {
      requireLogin('举报');
      return;
    }
    setReporting(true);
    try {
      const r = await api.reportPost(postId, {
        reason: reportReason,
        detail: reportDetail.trim() || undefined,
      });
      notify.success(r.message);
      setReportOpen(false);
      setReportDetail('');
      setReportReason('spam');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '举报失败');
    } finally {
      setReporting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      notify.warning('请填写拒绝原因');
      return;
    }
    setRejecting(true);
    try {
      const r = await api.adminRejectPost(postId, rejectReason.trim());
      clearAllFeedCache();
      window.dispatchEvent(new Event('posts-refresh'));
      notify.success(r.message);
      setRejectOpen(false);
      nav('/');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setRejecting(false);
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

  const handleCommentsLock = async () => {
    if (!post) return;
    try {
      const r = await api.adminCommentsLockPost(postId, !post.comments_locked);
      setPost(p => p ? { ...p, comments_locked: r.comments_locked } : p);
      if (r.comments_locked) {
        setReplyTo(null);
        setEditingCommentId(null);
      }
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  return (
    <article className="page-wrap post-detail-page" ref={pageRef}>
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

        {post.status === 'pending' && (
          <div className="post-moderation-banner post-moderation-banner--pending">
            该帖子审核中，仅你与管理员可见；通过后将公开显示。
          </div>
        )}
        {post.status === 'rejected' && (
          <div className="post-moderation-banner post-moderation-banner--rejected">
            该帖子未通过审核，仅你与管理员可见。可修改后重新提交，或查看站内私信中的拒绝原因。
          </div>
        )}

        <div className="post-detail-head">
          <h1 className="post-detail-title">
            {post.pinned && (
              <span className="post-pin-badge post-pin-badge--detail" title="全局置顶">全局置顶</span>
            )}
            {post.board_pinned && (
              <span className="post-pin-badge post-pin-badge--board post-pin-badge--detail" title="板块置顶">板块置顶</span>
            )}
            {post.featured && <FeaturedIcon className="mr-2" size={18} />}
            {post.status === 'pending' && <Badge variant="orange" className="mr-2 align-middle">审核中</Badge>}
            {post.status === 'rejected' && <Badge variant="destructive" className="mr-2 align-middle">未通过</Badge>}
            {post.post_type === 'question' && (
              <span
                className={`post-qa-badge post-qa-badge--detail${post.question_resolved ? ' post-qa-badge--resolved' : ' post-qa-badge--open'}`}
              >
                {post.question_resolved ? '已解决' : '未解决'}
              </span>
            )}
            {post.post_type === 'poll' && (
              <span className="post-type-badge post-type-badge--poll">投票</span>
            )}
            {post.post_type === 'bounty' && post.bounty_status === 'open' && (post.bounty_points ?? 0) > 0 && (
              <span className="post-bounty-badge post-bounty-badge--open post-bounty-badge--detail">悬赏 {post.bounty_points}</span>
            )}
            {post.post_type === 'bounty' && post.bounty_status === 'awarded' && (
              <span className="post-bounty-badge post-bounty-badge--awarded post-bounty-badge--detail">已采纳</span>
            )}
            {post.post_type === 'lottery' && (
              <span className="post-type-badge post-type-badge--lottery">
                {post.lottery_status === 'drawn' ? '已开奖' : '抽奖'}
              </span>
            )}
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
              <UserLink user={post.user} className="post-detail-author-name" showBadges />
              <span className="post-detail-meta-line">
                发布于 {formatDateTime(post.created_at)}
                {showEdited && (
                  <> · 编辑于 {formatDateTime(post.updated_at!)}</>
                )}
                {' · '}{post.view_count} 次浏览
                {post.edit_locked && (
                  <span className="post-detail-locked-tag" title="管理员已锁定编辑">
                    <Lock size={12} /> 编辑锁定
                  </span>
                )}
                {post.comments_locked && (
                  <span className="post-detail-locked-tag" title="管理员已锁定讨论">
                    <MessageSquareOff size={12} /> 讨论锁定
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="post-detail-tags">
            {tags.map(t => (
              <button
                key={t}
                type="button"
                className="post-detail-tag-btn"
                onClick={() => nav(`/?tag=${encodeURIComponent(t)}`)}
              >
                <Badge variant="secondary">{t}</Badge>
              </button>
            ))}
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

        {poll && (
          <PostPollCard
            postId={post.id}
            poll={poll}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onUpdate={setPoll}
          />
        )}
        <PostBountyBanner
          post={post}
          isOwnerOrAdmin={isOwnerOrAdmin}
          isAdmin={isAdmin}
          canRefund={bountyCanRefund}
          refundBlockReason={bountyRefundBlockReason}
          eligibleReplyCount={bountyEligibleReplyCount}
          onUpdate={reloadPostContent}
          onJumpToAwarded={handleJumpToAwarded}
          canJumpToAwarded={canJumpToAwarded}
        />
        {lottery && (
          <PostLotteryCard
            postId={post.id}
            lottery={lottery}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onUpdate={v => { setLottery(v); void reloadPostContent(); }}
          />
        )}

        <PostContent
          html={post.content || ''}
          isLoggedIn={!!user}
          postId={post.id}
          onHeadingsChange={handleHeadingsChange}
          onRequestReply={scrollToCommentBox}
          onUnlocked={() => { void reloadPostContent(); }}
        />

        <div className="post-detail-actions">
          <div className="post-detail-actions-primary">
            <Button
              variant={liked ? 'default' : 'outline'}
              size="sm"
              onClick={handleLike}
              title={!user ? '登录后即可点赞' : undefined}
            >
              <ThumbsUp />
              点赞 {post.like_count}
            </Button>
            <Button
              variant={favorited ? 'default' : 'outline'}
              size="sm"
              onClick={handleFavorite}
              title={!user ? '登录后即可收藏' : undefined}
            >
              <Star />
              {favorited ? '已收藏' : '收藏'}
            </Button>
            {!user ? (
              <Button
                variant="outline"
                size="sm"
                className="post-detail-more-btn"
                aria-label="更多操作"
                onClick={() => requireLogin('举报')}
              >
                <MoreHorizontal />
              </Button>
            ) : user.id !== post.user_id ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="post-detail-more-btn"
                    aria-label="更多操作"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="report-more-menu">
                  <DropdownMenuItem
                    className="report-more-menu__item"
                    onSelect={() => setReportOpen(true)}
                  >
                    <Flag size={14} />
                    举报
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {(isOwnerOrAdmin || canEdit || isAdmin) && (
            <div className="post-detail-actions-manage">
              {isOwnerOrAdmin && post.post_type === 'question' && (
                <Button
                  variant={post.question_resolved ? 'outline' : 'default'}
                  size="sm"
                  onClick={handleToggleResolved}
                >
                  {post.question_resolved ? <CircleHelp /> : <CircleCheck />}
                  {post.question_resolved ? '标为未解决' : '标为已解决'}
                </Button>
              )}
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
              {isAdmin && (
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
                      <AlertDialogDescription>
                        帖子与评论将移入回收站，可在后台恢复或永久删除。普通用户不可自行删除内容。
                      </AlertDialogDescription>
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
                  {(post.status === 'pending' || post.status === 'rejected') && (
                    <Button variant="default" size="sm" onClick={handleApprove}>
                      通过审核
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleFeature}>
                    <Sparkles />
                    {post.featured ? '取消精华' : '设为精华'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePin}>
                    <Pin />
                    {post.pinned ? '取消全局置顶' : '全局置顶'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleBoardPin}>
                    <Pin />
                    {post.board_pinned ? '取消板块置顶' : '板块置顶'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleLock}>
                    <Lock />
                    {post.edit_locked ? '解锁编辑' : '锁定编辑'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCommentsLock}>
                    {post.comments_locked ? <LockOpen /> : <MessageSquareOff />}
                    {post.comments_locked ? '开放讨论' : '锁定讨论'}
                  </Button>
                  {post.status !== 'rejected' && (
                    <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)}>
                      <Ban />
                      拒绝并通知
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>举报帖子</DialogTitle>
            <DialogDescription>请选择原因，管理员将尽快处理。</DialogDescription>
          </DialogHeader>
          <div className="pm-compose-fields">
            <label className="pm-field">
              <span>举报原因</span>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value as ReportReason)}
              >
                {REPORT_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="pm-field">
              <span>补充说明（可选）</span>
              <textarea
                value={reportDetail}
                onChange={(e) => setReportDetail(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="补充更多细节…"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>取消</Button>
            <Button loading={reporting} onClick={handleReport}>提交举报</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝帖子并通知作者</DialogTitle>
            <DialogDescription>
              帖子将移入回收站，拒绝原因会通过站内私信发送给作者。
            </DialogDescription>
          </DialogHeader>
          <div className="pm-compose-fields">
            <label className="pm-field">
              <span>拒绝原因</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="请说明未通过的原因…"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button>
            <Button variant="destructive" loading={rejecting} onClick={handleReject}>确认拒绝</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

        {post.comments_locked ? (
          <div className="comment-locked-banner" role="status">
            <MessageSquareOff size={16} aria-hidden />
            该帖子已锁定讨论，暂不可发表新评论
          </div>
        ) : !replyTo && (
          <div className="comment-box-wrap" ref={commentBoxRef}>
            <CommentBox {...commentBoxProps} />
          </div>
        )}

        <div className="comment-list-area">
          {comments.length === 0 && !replyTo ? (
            <div className="comment-empty">
              <MessageSquare className="comment-empty-icon" aria-hidden size={32} strokeWidth={1.5} />
              <p>
                {post.comments_locked
                  ? '暂无评论'
                  : user ? '暂无评论，来抢沙发吧' : '暂无评论，登录后来抢沙发吧'}
              </p>
            </div>
          ) : (
            <CommentThreadList
              comments={comments}
              highlightFloor={highlightFloor}
              replyToId={post.comments_locked ? null : (replyTo?.id ?? null)}
              editingId={editingCommentId}
              currentUser={user}
              onReply={post.comments_locked ? () => undefined : handleReplyTo}
              onCancelReply={() => setReplyTo(null)}
              onStartEdit={(c) => {
                setReplyTo(null);
                setEditingCommentId(c.id);
              }}
              onCancelEdit={() => setEditingCommentId(null)}
              onSaveEdit={handleSaveComment}
              onDelete={handleDeleteComment}
              onApprove={user?.role === 'admin' ? handleApproveComment : undefined}
              onRequireLogin={requireLogin}
              onLikeUpdate={(commentId, liked, likeCount) => {
                setComments(list => list.map(item => (
                  item.id === commentId ? { ...item, liked, like_count: likeCount } : item
                )));
              }}
              renderReplyBox={post.comments_locked ? undefined : (c) => (
                <CommentBox
                  key={c.id}
                  {...commentBoxProps}
                  replyTo={c}
                  inline
                />
              )}
              bountyAward={post.post_type === 'bounty' ? {
                open: post.bounty_status === 'open' && (post.bounty_points ?? 0) > 0,
                awardedCommentId: post.bounty_comment_id,
                postAuthorId: post.user_id,
                canAward: isOwnerOrAdmin,
                onAward: handleBountyAward,
              } : undefined}
            />
          )}
        </div>
      </div>
      <AlertDialog
        open={bountyAwardTarget != null}
        onOpenChange={(open) => { if (!open && !bountyAwarding) setBountyAwardTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>采纳该回复？</AlertDialogTitle>
            <AlertDialogDescription>
              确定采纳该回复并发放 {post.bounty_points ?? 0} 悬赏积分？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bountyAwarding}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={bountyAwarding}
              onClick={(e) => {
                e.preventDefault();
                void confirmBountyAward();
              }}
            >
              {bountyAwarding ? '发放中…' : '确认采纳'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <InFlowSiteFooter />
    </article>
  );
}
