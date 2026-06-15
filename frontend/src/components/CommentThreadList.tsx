import { Clock, MessageSquare, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Comment } from '../api/types';
import CommentContent from './CommentContent';
import {
  commentNick,
  commentInitial,
  formatCommentDate,
  isGuestComment,
  buildCommentTree,
  type CommentNode,
} from '../utils/comment';

interface ItemProps {
  node: CommentNode;
  nested?: boolean;
  highlightFloor?: number | null;
  replyToId?: number | null;
  onReply: (comment: Comment) => void;
  onCancelReply: () => void;
  renderReplyBox?: (comment: Comment) => ReactNode;
}

/** 单条评论（支持嵌套子回复 + 内联回复框） */
function CommentItem({
  node,
  nested,
  highlightFloor,
  replyToId,
  onReply,
  onCancelReply,
  renderReplyBox,
}: ItemProps) {
  const c = node.comment;
  const nick = commentNick(c);
  const guest = isGuestComment(c);
  const isHighlighted = highlightFloor === c.floor;
  const hidden = !!c.content_hidden;
  const isReplying = replyToId === c.id;

  return (
    <div
      id={`floor-${c.floor}`}
      className={`waline-comment ${nested ? 'nested' : ''} ${isHighlighted ? 'highlight' : ''}`}
    >
      <div className={`waline-comment-avatar ${guest && !c.user?.avatar ? 'guest' : ''}`}>
        {c.user?.avatar ? (
          <img src={c.user.avatar} alt="" />
        ) : (
          commentInitial(c)
        )}
      </div>

      <div className="waline-comment-main">
        <div className="waline-comment-head">
          {c.guest_url ? (
            <a href={c.guest_url} target="_blank" rel="noopener noreferrer" className="waline-comment-author">
              {nick}
            </a>
          ) : (
            <span className="waline-comment-author">{nick}</span>
          )}
        </div>

        {hidden ? (
          <div className="waline-comment-private-mask">
            该评论为私密评论，仅文章作者与评论发起者可见！
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
          </span>
          {isReplying ? (
            <button type="button" className="waline-comment-reply-btn cancel" onClick={onCancelReply}>
              <X size={14} />
              取消
            </button>
          ) : (
            <button type="button" className="waline-comment-reply-btn" onClick={() => onReply(c)}>
              <MessageSquare size={14} />
              回复
            </button>
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
                onReply={onReply}
                onCancelReply={onCancelReply}
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
  onReply: (comment: Comment) => void;
  onCancelReply: () => void;
  renderReplyBox?: (comment: Comment) => ReactNode;
}

/** Waline 嵌套楼层评论列表 */
export default function CommentThreadList({
  comments,
  highlightFloor,
  replyToId,
  onReply,
  onCancelReply,
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
          onReply={onReply}
          onCancelReply={onCancelReply}
          renderReplyBox={renderReplyBox}
        />
      ))}
    </div>
  );
}
