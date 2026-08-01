import { useState, useEffect } from 'react';
import { Clock, MessageSquare, X, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Comment, User } from '../api/types';
import CommentContent from './CommentContent';
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
import UserLink from './UserLink';

function canManageComment(c: Comment, user?: User | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return c.user_id > 0 && c.user_id === user.id;
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
  const manageable = canManageComment(c, currentUser);
  const showEdited = !hidden && !!c.updated_at && isTimeDiffSignificant(c.created_at, c.updated_at);
  const [editText, setEditText] = useState(c.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
            {c.reply_target && (
              <span className="waline-reply-at">@{commentNick(c.reply_target)}</span>
            )}
            <CommentContent content={c.content} />
          </div>
        )}

        <div className="waline-comment-meta">
          <span className="waline-comment-date">
            <Clock size={14} />
            {formatCommentDate(c.created_at)}
            {showEdited && <span className="waline-comment-edited"> · 已编辑</span>}
          </span>
          {!hidden && !isEditing && (
            isReplying ? (
              <button type="button" className="waline-comment-reply-btn cancel" onClick={onCancelReply}>
                <X size={14} />
                取消
              </button>
            ) : (
              <button type="button" className="waline-comment-reply-btn" onClick={() => onReply(c)}>
                <MessageSquare size={14} />
                回复
              </button>
            )
          )}
          {!hidden && !isEditing && manageable && (
            <button type="button" className="waline-comment-reply-btn" onClick={() => onStartEdit(c)}>
              <Pencil size={14} />
              编辑
            </button>
          )}
          {!hidden && !isEditing && manageable && (
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
          renderReplyBox={renderReplyBox}
        />
      ))}
    </div>
  );
}
