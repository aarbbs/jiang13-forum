import { useState } from 'react';
import { Gift } from 'lucide-react';
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
import type { PostLotteryView } from '../api/types';
import { userPath } from '../utils/userPath';

interface Props {
  postId: number;
  lottery: PostLotteryView;
  isOwnerOrAdmin: boolean;
  onUpdate: (lottery: PostLotteryView) => void;
}

/** 抽奖帖信息卡 */
export default function PostLotteryCard({ postId, lottery, isOwnerOrAdmin, onUpdate }: Props) {
  const [drawOpen, setDrawOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const drawn = lottery.status === 'drawn';
  const canDraw = !drawn && isOwnerOrAdmin && lottery.participant_count >= lottery.winner_count;

  const confirmDraw = async () => {
    setDrawing(true);
    try {
      const r = await api.postLotteryDraw(postId);
      onUpdate(r.lottery);
      notify.success('开奖完成');
      setDrawOpen(false);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '开奖失败');
    } finally {
      setDrawing(false);
    }
  };

  return (
    <>
      <section className="post-lottery" aria-label="抽奖">
        <div className="post-lottery__head">
          <Gift size={18} aria-hidden />
          <strong>{drawn ? '已开奖' : '抽奖进行中'}</strong>
          <span>抽取 {lottery.winner_count} 人 · 当前 {lottery.participant_count} 人参与</span>
        </div>
        {!drawn && (
          <p className="post-lottery__hint">回帖即可参与（楼主除外），由作者或管理员手动开奖</p>
        )}
        {drawn && lottery.winners && lottery.winners.length > 0 && (
          <ul className="post-lottery__winners">
            {lottery.winners.map(w => (
              <li key={`${w.user_id}-${w.comment_id}`}>
                <a href={userPath(w.user_id)}>{w.nickname || w.username}</a>
              </li>
            ))}
          </ul>
        )}
        {canDraw && (
          <Button type="button" size="sm" onClick={() => setDrawOpen(true)}>立即开奖</Button>
        )}
      </section>
      <AlertDialog
        open={drawOpen}
        onOpenChange={(next) => { if (!next && !drawing) setDrawOpen(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>立即开奖？</AlertDialogTitle>
            <AlertDialogDescription>
              将从 {lottery.participant_count} 位参与者中抽取 {lottery.winner_count} 名中奖者。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={drawing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={drawing}
              onClick={(e) => {
                e.preventDefault();
                void confirmDraw();
              }}
            >
              {drawing ? '开奖中…' : '确认开奖'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
