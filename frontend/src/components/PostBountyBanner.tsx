import { useState } from 'react';
import { CheckCircle2, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem } from '../api/types';

interface Props {
  post: PostItem;
  isOwnerOrAdmin: boolean;
  isAdmin?: boolean;
  /** 是否可取消悬赏（楼主有他人回复时为 false；管理员为 true） */
  canRefund?: boolean;
  refundBlockReason?: string;
  eligibleReplyCount?: number;
  onUpdate?: () => void;
  /** 跳转到被采纳的评论楼层 */
  onJumpToAwarded?: () => void;
  /** 被采纳评论是否仍在当前评论列表中 */
  canJumpToAwarded?: boolean;
}

/** 悬赏帖状态卡 */
export default function PostBountyBanner({
  post,
  isOwnerOrAdmin,
  isAdmin = false,
  canRefund = true,
  refundBlockReason,
  eligibleReplyCount = 0,
  onUpdate,
  onJumpToAwarded,
  canJumpToAwarded,
}: Props) {
  const [refundOpen, setRefundOpen] = useState(false);
  const [refunding, setRefunding] = useState(false);

  if (post.post_type !== 'bounty') return null;

  const points = post.bounty_points ?? 0;
  const open = post.bounty_status === 'open' && points > 0;
  const awarded = post.bounty_status === 'awarded';
  const refunded = post.bounty_status === 'refunded';

  if (refunded && !isOwnerOrAdmin) return null;

  const showRefundButton = isOwnerOrAdmin && canRefund;
  const ownerRefundBlocked = isOwnerOrAdmin && !isAdmin && !canRefund;

  const confirmRefund = async () => {
    setRefunding(true);
    try {
      await api.bountyRefund(post.id);
      notify.success('悬赏已退回');
      setRefundOpen(false);
      onUpdate?.();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setRefunding(false);
    }
  };

  const refundDialogDescription = isAdmin && eligibleReplyCount > 0
    ? `将强制取消悬赏并把 ${points} 积分退回楼主账户。当前已有 ${eligibleReplyCount} 条他人回复，请确认已审慎处理。`
    : `确定取消悬赏并将 ${points} 积分退回你的账户？取消后他人将无法再参与本帖悬赏。`;

  if (open) {
    let ownerHint = '在评论上点击「采纳」发放积分';
    if (ownerRefundBlocked) {
      ownerHint = refundBlockReason || '已有用户回复，请从评论中采纳发放积分';
    }

    return (
      <>
        <section className="post-bounty post-bounty--open" aria-label="悬赏">
          <div className="post-bounty__head">
            <div className="post-bounty__lead">
              <Coins size={18} className="post-bounty__icon" aria-hidden />
              <div className="post-bounty__titles">
                <strong className="post-bounty__title">悬赏进行中</strong>
                <span className="post-bounty__points">{points} 积分</span>
              </div>
            </div>
            {showRefundButton && (
              <div className="post-bounty__actions">
                <Button type="button" variant="outline" size="sm" onClick={() => setRefundOpen(true)}>
                  取消悬赏
                </Button>
              </div>
            )}
          </div>
          <p className="post-bounty__hint">
            {isOwnerOrAdmin
              ? ownerHint
              : `回复本帖，优质回答可获得这 ${points} 积分`}
          </p>
        </section>
        {showRefundButton && (
          <AlertDialog
            open={refundOpen}
            onOpenChange={(next) => { if (!next && !refunding) setRefundOpen(false); }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{isAdmin && eligibleReplyCount > 0 ? '强制取消悬赏？' : '取消悬赏？'}</AlertDialogTitle>
                <AlertDialogDescription>
                  {refundDialogDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={refunding}>返回</AlertDialogCancel>
                <AlertDialogAction
                  disabled={refunding}
                  onClick={(e) => {
                    e.preventDefault();
                    void confirmRefund();
                  }}
                >
                  {refunding ? '退回中…' : '确认取消'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </>
    );
  }

  if (awarded) {
    return (
      <section className="post-bounty post-bounty--awarded" aria-label="悬赏已采纳">
        <div className="post-bounty__head">
          <div className="post-bounty__lead">
            <CheckCircle2 size={18} className="post-bounty__icon" aria-hidden />
            <div className="post-bounty__titles">
              <strong className="post-bounty__title">已采纳</strong>
              <span className="post-bounty__subtitle">
                {points} 积分已发放给被采纳的回复
              </span>
            </div>
          </div>
        </div>
        {canJumpToAwarded && onJumpToAwarded && (
          <div className="post-bounty__actions post-bounty__actions--inline">
            <button type="button" className="post-bounty__jump" onClick={onJumpToAwarded}>
              查看被采纳的回复
            </button>
          </div>
        )}
      </section>
    );
  }

  if (refunded) {
    return (
      <section className="post-bounty post-bounty--refunded" aria-label="悬赏已退回">
        <div className="post-bounty__head">
          <div className="post-bounty__lead">
            <Coins size={18} className="post-bounty__icon" aria-hidden />
            <div className="post-bounty__titles">
              <strong className="post-bounty__title">悬赏已取消</strong>
              <span className="post-bounty__subtitle">积分已退回</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return null;
}
