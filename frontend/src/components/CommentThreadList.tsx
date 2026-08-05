import { useState, useEffect } from 'react';
import { Check, Clock, History, MessageSquare, X, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Comment, User } from '../api/types';
import CommentContent from './CommentContent';
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
  commentNick,
  commentInitial,
  formatCommentDate,
  isGuestComment,
  buildCommentTree,
  type CommentNode,
} from '../utils/comment';
import { isTimeDiffSignificant } from '../utils/content';
import { useForumLimits } from '../hooks/useForumLimits';
import { Tooltip } from './ui/Tooltip';
import UserLink from './UserLink';

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
  const [editText, setEditText] = useState(c.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [revOpen, setRevOpen] = useState(false);

  useEffect(() => {
    if (isEditing) setEditText(c.content);
  }, [isEditing, c.content, c.id]);

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
            />
          ) : (
            <span className="waline-comment-author">{nick}</span>
          )}
          {!c.reply_to && (
            <span className="waline-comment-floor" aria-label={`第 ${c.floor} 楼`}>
              #{c.floor}
            </span>
          )}
        </div>

        {hidden ? (
          <div className="waline-comment-private-mask">
            该评论为私密评论，仅文章作者与评论发起者可见！
          </div>
        ) : isEditing ? (
          <div className="waline-comment-edit">
            <textarea
              className="waline-comment-edit-input"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={3}
              maxLength={limits.comment_max > 0 ? limits.comment_max : undefined}
            />
            <div className="waline-comment-edit-actions">
              <button type="button" className="waline-comment-reply-btn cancel" onClick={onCancelEdit} disabled={saving}>
                取消
              </button>
              <button
                type="button"
                className="waline-comment-reply-btn"
                onClick={handleSave}
                disabled={saving || !editText.trim()}
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
          {!hidden && !isEditing && (
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
                  <AlertDialogDescription>删除后不可恢复。</AlertDialogDescription>
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
        </div>

        {isAdmin && (
          <CommentRevisionDialog open={revOpen} onOpenChange={setRevOpen} comment={c} />
        )}

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
          renderReplyBox={renderReplyBox}
        />
      ))}
    </div>
  );
}
