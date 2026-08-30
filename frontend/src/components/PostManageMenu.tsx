import {
  Ban,
  CircleCheck,
  CircleHelp,
  EllipsisVertical,
  History,
  Lock,
  LockOpen,
  MessageSquareOff,
  Pencil,
  Pin,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PostItem } from '../api/types';

export interface PostManageMenuProps {
  post: PostItem;
  isAdmin: boolean;
  isOwnerOrAdmin: boolean;
  canEdit: boolean;
  isEdited: boolean;
  isMobile?: boolean;
  editRemaining?: string;
  editBlockReason?: string;
  deleting?: boolean;
  onEdit: () => void;
  onShowRevisions: () => void;
  onToggleResolved: () => void;
  onApprove: () => void;
  onReject: () => void;
  onFeature: () => void;
  onPin: () => void;
  onBoardPin: () => void;
  onLock: () => void;
  onCommentsLock: () => void;
  onDelete: () => void;
}

/** 帖子右上角管理菜单：编辑、审核、置顶、锁定、删除等 */
export default function PostManageMenu({
  post,
  isAdmin,
  isOwnerOrAdmin,
  canEdit,
  isEdited,
  isMobile,
  editRemaining,
  editBlockReason,
  deleting,
  onEdit,
  onShowRevisions,
  onToggleResolved,
  onApprove,
  onReject,
  onFeature,
  onPin,
  onBoardPin,
  onLock,
  onCommentsLock,
  onDelete,
}: PostManageMenuProps) {
  const showContent =
    canEdit
    || (isOwnerOrAdmin && isEdited)
    || (isOwnerOrAdmin && post.post_type === 'question');
  const hint = editRemaining || (!canEdit && isOwnerOrAdmin ? editBlockReason : '') || '';

  if (!showContent && !isAdmin && !hint) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="post-manage-menu-trigger"
          aria-label="管理帖子"
        >
          {!isMobile && <span>管理</span>}
          <EllipsisVertical size={16} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="post-manage-menu">
        {hint && (
          <>
            <DropdownMenuLabel className="post-manage-menu-hint">
              {hint}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        {showContent && (
          <>
            <DropdownMenuLabel>内容</DropdownMenuLabel>
            {canEdit && (
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil size={14} aria-hidden />
                编辑
              </DropdownMenuItem>
            )}
            {isOwnerOrAdmin && isEdited && (
              <DropdownMenuItem onSelect={onShowRevisions}>
                <History size={14} aria-hidden />
                编辑历史
              </DropdownMenuItem>
            )}
            {isOwnerOrAdmin && post.post_type === 'question' && (
              <DropdownMenuItem onSelect={onToggleResolved}>
                {post.question_resolved
                  ? <CircleHelp size={14} aria-hidden />
                  : <CircleCheck size={14} aria-hidden />}
                {post.question_resolved ? '标为未解决' : '标为已解决'}
              </DropdownMenuItem>
            )}
            {isAdmin && <DropdownMenuSeparator />}
          </>
        )}

        {isAdmin && (
          <>
            <DropdownMenuLabel>审核</DropdownMenuLabel>
            {(post.status === 'pending' || post.status === 'rejected') && (
              <DropdownMenuItem onSelect={onApprove}>
                <CircleCheck size={14} aria-hidden />
                通过审核
              </DropdownMenuItem>
            )}
            {post.status !== 'rejected' && (
              <DropdownMenuItem onSelect={onReject}>
                <Ban size={14} aria-hidden />
                拒绝并通知
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />

            <DropdownMenuLabel>展示</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onFeature}>
              <Sparkles size={14} aria-hidden />
              {post.featured ? '取消精华' : '设为精华'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPin}>
              <Pin size={14} aria-hidden />
              {post.pinned ? '取消全局置顶' : '全局置顶'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onBoardPin}>
              <Pin size={14} aria-hidden />
              {post.board_pinned ? '取消板块置顶' : '板块置顶'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuLabel>讨论</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onLock}>
              <Lock size={14} aria-hidden />
              {post.edit_locked ? '解锁编辑' : '锁定编辑'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCommentsLock}>
              {post.comments_locked
                ? <LockOpen size={14} aria-hidden />
                : <MessageSquareOff size={14} aria-hidden />}
              {post.comments_locked ? '开放讨论' : '锁定讨论'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuLabel>危险</DropdownMenuLabel>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={deleting}
              onSelect={onDelete}
            >
              <Trash2 size={14} aria-hidden />
              删除
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
