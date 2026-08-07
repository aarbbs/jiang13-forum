import { useState, useEffect } from 'react';
import {
  Check, Clock, History, MessageSquare, X, Pencil, Trash2,
  ThumbsUp, MoreHorizontal, Flag,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Comment, ReportReason, User } from '../api/types';
import { api } from '../api/client';
import CommentContent from './CommentContent';
import CommentEditor from './CommentEditor';
import CommentRevisionDialog from './CommentRevisionDialog';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import {
  commentNick,
  commentInitial,
  formatCommentDate,
  isGuestComment,
  buildCommentTree,
  type CommentNode,
} from '../utils/comment';
import { isTimeDiffSignificant } from '../utils/content';
import { REPORT_REASON_OPTIONS } from '../utils/report';
import { useForumLimits } from '../hooks/useForumLimits';
import { isHtmlEmpty } from '../utils/postContent';
import { Tooltip } from './ui/Tooltip';
import UserLink from './UserLink';
import { cn } from '@/lib/utils';

function isCommentAuthor(c: Comment, user?: User | null): boolean {
  return !!user && c.user_id > 0 && c.user_id === user.id;
}

function canEditComment(c: Comment, user: User | null | undefined, windowMinutes: number): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!isCommentAuthor(c, user)) return false;
  if (windowMinutes <= 0) return true;
  const created = new Date(c.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= windowMinutes * 60_000;
}

interface ItemProps {
  node: CommentNode;
  nested?: boolean;
  highlightFloor?: number | null;
  replyToId?: number | null;
  editingId?: number | null;
  currentUser?: User | null;
  onReply: (comment: Comment) => void;
  onCancelReply: () => void;
  onStartEdit: (comment: Comment) => void;
  onCancelEdit: () => void;
  onSaveEdit: (comment: Comment, content: string) => Promise<void>;
  onDelete: (comment: Comment) => Promise<void>;
  onApprove?: (comment: Comment) => Promise<void>;
  onRequireLogin?: (actionLabel: string) => void;
  onLikeUpdate?: (commentId: number, liked: boolean, likeCount: number) => void;
  renderReplyBox?: (comment: Comment) => ReactNode;
}

/** 单条评论（支持嵌套子回复 + 内联回复框 + 编辑/删除） */
function CommentItem({
  node,
  nested,
  highlightFloor,
  replyToId,
  editingId,
  currentUser,
  onReply,
  onCancelReply,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onApprove,
  onRequireLogin,
  onLikeUpdate,
  renderReplyBox,
}: ItemProps) {
  const { limits } = useForumLimits();
  const c = node.comment;
  const nick = commentNick(c);
  const guest = isGuestComment(c);
  const isHighlighted = highlightFloor === c.floor;
  const hidden = !!c.content_hidden;
  const isReplying = replyToId === c.id;
  const isEditing = editingId === c.id;
  const isAdmin = currentUser?.role === 'admin';
  const editWindowMinutes = limits.comment_edit_window_minutes ?? 3;
  // 到期后强制重渲染，使「编辑」按钮自动消失
  const [, setEditExpireTick] = useState(0);
  useEffect(() => {
    if (!currentUser || currentUser.role === 'admin') return;
    if (!isCommentAuthor(c, currentUser)) return;
    if (editWindowMinutes <= 0) return;
    const created = new Date(c.created_at).getTime();
    if (Number.isNaN(created)) return;
    const remaining = created + editWindowMinutes * 60_000 - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setEditExpireTick(n => n + 1), remaining + 30);
    return () => window.clearTimeout(timer);
  }, [c.created_at, c.id, c.user_id, currentUser, editWindowMinutes]);
  const canEdit = canEditComment(c, currentUser, editWindowMinutes);
  const canDelete = isAdmin;
  const canApprove = isAdmin
    && (c.status === 'pending' || c.status === 'rejected')
    && !!onApprove;
  const showEdited = !hidden && !!c.updated_at && isTimeDiffSignificant(c.created_at, c.updated_at);
  const canReport = !hidden && !isEditing && !isCommentAuthor(c, currentUser);
  const [editText, setEditText] = useState(c.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [liking, setLiking] = useState(false);
  const [liked, setLiked] = useState(!!c.liked);
  const [likeCount, setLikeCount] = useState(c.like_count ?? 0);
  const [revOpen, setRevOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportDetail, setReportDetail] = useState('');
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (isEditing) setEditText(c.content);
  }, [isEditing, c.content, c.id]);

  useEffect(() => {
    setLiked(!!c.liked);
    setLikeCount(c.like_count ?? 0);
  }, [c.id, c.liked, c.like_count]);

  const handleSave = async () => {
    const next = editText.trim();
    if (!next) return;
    setSaving(true);
    try {
      await onSaveEdit(c, next);
    } finally {
      setSaving(false);
    }
  };

  const handleLike = async () => {
    if (!currentUser) {
      onRequireLogin?.('点赞');
      return;
    }
    if (liking) return;
    setLiking(true);
    try {
      const r = await api.likeComment(c.id);
      setLiked(r.liked);
      setLikeCount(r.like_count);
      onLikeUpdate?.(c.id, r.liked, r.like_count);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '点赞失败');
    } finally {
      setLiking(false);
    }
  };

  const openReport = () => {
    if (!currentUser) {
      onRequireLogin?.('举报');
      return;
    }
    setReportReason('spam');
    setReportDetail('');
    setReportOpen(true);
  };

  const handleReport = async () => {
    setReporting(true);
    try {
      const r = await api.reportComment(c.id, {
        reason: reportReason,
        detail: reportDetail.trim() || undefined,
      });
      notify.success(r.message);
      setReportOpen(false);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '举报失败');
    } finally {
      setReporting(false);
    }
  };

  return (
    <div
      id={`floor-${c.floor}`}
      className={`waline-comment ${nested ? 'nested' : ''} ${isHighlighted ? 'highlight' : ''}`}
    >
      {!guest && c.user_id ? (
        <UserLink
          user={c.user ?? { id: c.user_id, nickname: nick }}
          showAvatar={false}
          showName={false}
          className={`waline-comment-avatar user-link--avatar-only${!c.user?.avatar ? ' guest' : ''}`}
        >
          {c.user?.avatar ? (
            <img src={c.user.avatar} alt="" loading="lazy" decoding="async" />
          ) : (
            commentInitial(c)
          )}
        </UserLink>
      ) : (
        <div className={`waline-comment-avatar ${!c.user?.avatar ? 'guest' : ''}`}>
          {c.user?.avatar ? (
            <img src={c.user.avatar} alt="" loading="lazy" decoding="async" />
          ) : (
            commentInitial(c)
          )}
        </div>
      )}

      <div className="waline-comment-main">
        <div className="waline-comment-head">
          {guest && c.guest_url ? (
            <a href={c.guest_url} target="_blank" rel="noopener noreferrer" className="waline-comment-author">
              {nick}
            </a>
          ) : !guest && c.user_id ? (
            <UserLink
              user={c.user ?? { id: c.user_id, nickname: nick }}
              className="waline-comment-author"
              showBadges
            />
          ) : (
            <span className="waline-comment-author">{nick}</span>
          )}
          {!hidden && (
            <button
              type="button"
              className={cn('waline-comment-like', liked && 'is-liked')}
              disabled={liking}
              aria-label={liked ? '取消点赞' : '点赞'}
              aria-pressed={liked}
              onClick={handleLike}
            >
              <ThumbsUp size={14} strokeWidth={2} />
              <span>{likeCount}</span>
            </button>
          )}
        </div>

        {hidden ? (
          <div className="waline-comment-private-mask">
            该评论为私密评论，仅文章作者与评论发起者可见！
          </div>
        ) : isEditing ? (
          <div className="waline-comment-edit">
            <CommentEditor
              value={editText}
              onChange={setEditText}
              placeholder="编辑评论…"
            />
            <div className="waline-comment-edit-actions">
              <button type="button" className="waline-comment-reply-btn cancel" onClick={onCancelEdit} disabled={saving}>
                取消
              </button>
              <button
                type="button"
                className="waline-comment-reply-btn"
                onClick={handleSave}
                disabled={saving || isHtmlEmpty(editText)}
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className="waline-comment-bubble">
            <CommentContent content={c.content} />
          </div>
        )}

        <div className="waline-comment-meta">
          <span className="waline-comment-date">
            <Clock size={14} />
            {formatCommentDate(c.created_at)}
            {isAdmin && showEdited && <span className="waline-comment-edited"> · 已编辑</span>}
            {c.status === 'pending' && <span className="waline-comment-status waline-comment-status--pending"> · 审核中</span>}
            {c.status === 'rejected' && <span className="waline-comment-status waline-comment-status--rejected"> · 未通过</span>}
          </span>
          {c.reply_target && (
            <span className="waline-reply-at">@{commentNick(c.reply_target)}</span>
          )}
          {!hidden && !isEditing && canApprove && (
            <button
              type="button"
              className="waline-comment-reply-btn waline-comment-approve-btn"
              disabled={approving}
              onClick={async () => {
                setApproving(true);
                try {
                  await onApprove?.(c);
                } finally {
                  setApproving(false);
                }
              }}
            >
              <Check size={14} />
              {approving ? '通过中…' : '通过'}
            </button>
          )}
          {!hidden && !isEditing && !!renderReplyBox && (
            isReplying ? (
              <button type="button" className="waline-comment-reply-btn cancel" onClick={onCancelReply}>
                <X size={14} />
                取消
              </button>
            ) : (
              <Tooltip content={`回复给 ${nick}`} side="top">
                <button type="button" className="waline-comment-reply-btn" onClick={() => onReply(c)}>
                  <MessageSquare size={14} />
                  回复
                </button>
              </Tooltip>
            )
          )}
          {!hidden && !isEditing && canEdit && (
            <button type="button" className="waline-comment-reply-btn" onClick={() => onStartEdit(c)}>
              <Pencil size={14} />
              编辑
            </button>
          )}
          {!hidden && !isEditing && isAdmin && showEdited && (
            <button type="button" className="waline-comment-reply-btn" onClick={() => setRevOpen(true)}>
              <History size={14} />
              编辑记录
            </button>
          )}
          {!hidden && !isEditing && canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="waline-comment-reply-btn cancel" disabled={deleting}>
                  <Trash2 size={14} />
                  删除
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确定删除该评论？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将同时移入回收站其下所有回复，可在后台恢复或永久删除。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await onDelete(c);
                      } finally {
                        setDeleting(false);
                      }
                    }}
                  >
                    删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canReport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="waline-comment-reply-btn waline-comment-more"
                  aria-label="更多操作"
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="report-more-menu">
                <DropdownMenuItem
                  className="report-more-menu__item"
                  onSelect={openReport}
                >
                  <Flag size={14} />
                  举报
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {isAdmin && (
          <CommentRevisionDialog open={revOpen} onOpenChange={setRevOpen} comment={c} />
        )}

        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>举报评论</DialogTitle>
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

        {isReplying && renderReplyBox && (
          <div id={`reply-box-${c.id}`} className="comment-box-wrap inline">
            {renderReplyBox(c)}
          </div>
        )}

        {node.children.length > 0 && (
          <div className="waline-replies">
            {node.children.map((child) => (
              <CommentItem
                key={child.comment.id}
                node={child}
                nested
                highlightFloor={highlightFloor}
                replyToId={replyToId}
                editingId={editingId}
                currentUser={currentUser}
                onReply={onReply}
                onCancelReply={onCancelReply}
                onStartEdit={onStartEdit}
                onCancelEdit={onCancelEdit}
                onSaveEdit={onSaveEdit}
                onDelete={onDelete}
                onApprove={onApprove}
                onRequireLogin={onRequireLogin}
                onLikeUpdate={onLikeUpdate}
                renderReplyBox={renderReplyBox}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  comments: Comment[];
  highlightFloor?: number | null;
  replyToId?: number | null;
  editingId?: number | null;
  currentUser?: User | null;
  onReply: (comment: Comment) => void;
  onCancelReply: () => void;
  onStartEdit: (comment: Comment) => void;
  onCancelEdit: () => void;
  onSaveEdit: (comment: Comment, content: string) => Promise<void>;
  onDelete: (comment: Comment) => Promise<void>;
  onApprove?: (comment: Comment) => Promise<void>;
  onRequireLogin?: (actionLabel: string) => void;
  onLikeUpdate?: (commentId: number, liked: boolean, likeCount: number) => void;
  renderReplyBox?: (comment: Comment) => ReactNode;
}

/** Waline 嵌套楼层评论列表 */
export default function CommentThreadList({
  comments,
  highlightFloor,
  replyToId,
  editingId,
  currentUser,
  onReply,
  onCancelReply,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onApprove,
  onRequireLogin,
  onLikeUpdate,
  renderReplyBox,
}: Props) {
  const tree = buildCommentTree(comments);

  return (
    <div className="comment-thread-list">
      {tree.map((node) => (
        <CommentItem
          key={node.comment.id}
          node={node}
          highlightFloor={highlightFloor}
          replyToId={replyToId}
          editingId={editingId}
          currentUser={currentUser}
          onReply={onReply}
          onCancelReply={onCancelReply}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onDelete={onDelete}
          onApprove={onApprove}
          onRequireLogin={onRequireLogin}
          onLikeUpdate={onLikeUpdate}
          renderReplyBox={renderReplyBox}
        />
      ))}
    </div>
  );
}
