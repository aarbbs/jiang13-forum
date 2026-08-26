import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PollView } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { formatDateTime } from '../utils/content';

interface Props {
  postId: number;
  poll: PollView;
  isOwnerOrAdmin: boolean;
  onUpdate: (poll: PollView) => void;
}

/** 投票帖投票卡 */
export default function PostPollCard({ postId, poll, isOwnerOrAdmin, onUpdate }: Props) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<number[]>(poll.my_option_ids ?? []);
  const [busy, setBusy] = useState(false);
  const voted = (poll.my_option_ids?.length ?? 0) > 0;
  const showResults = poll.closed || voted;
  const canVote = !voted && !poll.closed;

  const headTitle = poll.closed
    ? '投票已结束'
    : poll.multi
      ? `多选（最多 ${poll.max_choices} 项）`
      : '单选投票';

  const endsAtMs = poll.ends_at ? new Date(poll.ends_at).getTime() : NaN;
  const expiredByDeadline = poll.closed && poll.ends_at && !Number.isNaN(endsAtMs) && endsAtMs <= Date.now();

  const deadlineHint = poll.ends_at && !Number.isNaN(endsAtMs)
    ? poll.closed
      ? (expiredByDeadline ? `已于 ${formatDateTime(poll.ends_at)} 截止` : undefined)
      : `截止于 ${formatDateTime(poll.ends_at)}`
    : undefined;

  const toggle = (id: number) => {
    if (!canVote) return;
    if (!user) {
      notify.warning('请先登录');
      return;
    }
    if (poll.multi) {
      setSelected(prev => (
        prev.includes(id)
          ? prev.filter(x => x !== id)
          : [...prev, id].slice(0, poll.max_choices)
      ));
    } else {
      setSelected([id]);
    }
  };

  const submit = async () => {
    if (!user) {
      notify.warning('请先登录');
      return;
    }
    if (selected.length === 0) {
      notify.warning('请选择选项');
      return;
    }
    setBusy(true);
    try {
      const r = await api.pollVote(postId, selected);
      onUpdate(r.poll);
      notify.success('投票成功');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '投票失败');
    } finally {
      setBusy(false);
    }
  };

  const closePoll = async () => {
    setBusy(true);
    try {
      const r = await api.pollClose(postId);
      onUpdate(r.poll);
      notify.success('投票已结束');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="post-poll" aria-label="投票">
      <div className="post-poll__head">
        <BarChart3 size={18} aria-hidden />
        <strong>{headTitle}</strong>
        {deadlineHint && (
          <span className="post-poll__deadline">{deadlineHint}</span>
        )}
        <span className="post-poll__meta">{poll.total_votes} 票</span>
      </div>
      <ul
        className="post-poll__options"
        role={poll.multi ? 'group' : 'radiogroup'}
        aria-label="投票选项"
      >
        {poll.options.map(opt => {
          const isActive = selected.includes(opt.id);
          const isMine = poll.my_option_ids?.includes(opt.id);
          return (
            <li key={opt.id}>
              <button
                type="button"
                className={[
                  'post-poll__option',
                  poll.multi ? 'post-poll__option--multi' : 'post-poll__option--single',
                  isActive ? 'active' : '',
                  showResults ? 'results' : '',
                  isMine ? 'mine' : '',
                ].filter(Boolean).join(' ')}
                disabled={!canVote}
                onClick={() => toggle(opt.id)}
                role={poll.multi ? 'checkbox' : 'radio'}
                aria-checked={isActive}
              >
                <span className="post-poll__option-main">
                  <span className="post-poll__option-indicator" aria-hidden />
                  <span className="post-poll__option-text">{opt.text}</span>
                  {showResults && (
                    <span className="post-poll__option-stat">
                      {opt.percent ?? 0}% · {opt.vote_count} 票
                    </span>
                  )}
                </span>
                {showResults && (
                  <span className="post-poll__option-bar" aria-hidden>
                    <span
                      className="post-poll__option-fill"
                      style={{ width: `${opt.percent ?? 0}%` }}
                    />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="post-poll__actions">
        {canVote && user && (
          <Button
            type="button"
            size="sm"
            disabled={busy || selected.length === 0}
            onClick={submit}
          >
            提交投票
          </Button>
        )}
        {canVote && user && selected.length === 0 && (
          <p className="post-poll__select-hint">
            {poll.multi ? '请选择后提交' : '请选择一项后提交'}
          </p>
        )}
        {!user && canVote && (
          <p className="post-poll__login-hint">登录后可参与投票</p>
        )}
        {isOwnerOrAdmin && !poll.closed && (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={closePoll}>
            结束投票
          </Button>
        )}
      </div>
    </section>
  );
}
