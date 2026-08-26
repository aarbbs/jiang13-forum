import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { PostType } from './ComposeContextBar';

interface Props {
  postType: PostType;
  pollOptions: string[];
  onPollOptionsChange: (opts: string[]) => void;
  pollMulti: boolean;
  onPollMultiChange: (v: boolean) => void;
  pollMaxChoices: number;
  onPollMaxChoicesChange: (v: number) => void;
  pollEndsAt: string;
  onPollEndsAtChange: (v: string) => void;
  pollNoEndTime: boolean;
  onPollNoEndTimeChange: (v: boolean) => void;
  bountyPoints: number;
  onBountyPointsChange: (v: number) => void;
  userPointsBalance?: number;
  lotteryWinners: number;
  onLotteryWinnersChange: (v: number) => void;
  disabled?: boolean;
}

/** 默认截止时间：7 天后，分钟进位到下一整点 */
export function defaultPollEndsAtLocal(): string {
  const d = new Date(Date.now() + 7 * 24 * 3600_000);
  d.setMinutes(0, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setHours(d.getHours() + 1);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local → ISO8601（UTC） */
export function pollEndsAtLocalToISO(local: string): string | undefined {
  const trimmed = local.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** ISO8601 → datetime-local */
export function pollEndsAtISOToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 特殊帖类型附加字段（投票/悬赏/抽奖） */
export default function ComposeSpecialFields({
  postType,
  pollOptions,
  onPollOptionsChange,
  pollMulti,
  onPollMultiChange,
  pollMaxChoices,
  onPollMaxChoicesChange,
  pollEndsAt,
  onPollEndsAtChange,
  pollNoEndTime,
  onPollNoEndTimeChange,
  bountyPoints,
  onBountyPointsChange,
  userPointsBalance,
  lotteryWinners,
  onLotteryWinnersChange,
  disabled,
}: Props) {
  if (postType === 'normal' || postType === 'question') return null;

  if (postType === 'poll') {
    return (
      <section className="compose-special" aria-label="投票设置">
        <Label>投票选项（2-10 项）</Label>
        <div className="compose-special__poll-mode">
          <Switch checked={pollMulti} onCheckedChange={onPollMultiChange} disabled={disabled} id="poll-multi" />
          <label htmlFor="poll-multi">允许多选</label>
          {pollMulti && (
            <>
              <span className="compose-special__max-choices-label">最多可选</span>
              <Input
                type="number"
                min={1}
                max={pollOptions.length || 10}
                value={pollMaxChoices}
                onChange={e => onPollMaxChoicesChange(Number(e.target.value) || 1)}
                disabled={disabled}
                className="compose-special__max-choices"
                aria-label="最多可选"
              />
              <span className="compose-special__max-choices-suffix">项</span>
            </>
          )}
        </div>
        <div className="compose-special__poll-deadline">
          <div className="compose-special__poll-deadline-toggle">
            <Switch
              checked={pollNoEndTime}
              onCheckedChange={onPollNoEndTimeChange}
              disabled={disabled}
              id="poll-no-end-time"
            />
            <label htmlFor="poll-no-end-time">不限时</label>
          </div>
          {!pollNoEndTime && (
            <div className="compose-special__poll-deadline-field">
              <Label htmlFor="poll-ends-at" className="compose-special__poll-deadline-label">投票截止时间</Label>
              <Input
                id="poll-ends-at"
                type="datetime-local"
                value={pollEndsAt}
                onChange={e => onPollEndsAtChange(e.target.value)}
                disabled={disabled}
                className="compose-special__poll-deadline-input w-auto"
              />
            </div>
          )}
        </div>
        <div className="compose-special__options">
          {pollOptions.map((opt, i) => (
            <div key={i} className="compose-special__option-row">
              <Input
                value={opt}
                placeholder={`选项 ${i + 1}`}
                maxLength={64}
                disabled={disabled}
                onChange={e => {
                  const next = [...pollOptions];
                  next[i] = e.target.value;
                  onPollOptionsChange(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || pollOptions.length <= 2}
                onClick={() => onPollOptionsChange(pollOptions.filter((_, j) => j !== i))}
                aria-label="删除选项"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
        {pollOptions.length < 10 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onPollOptionsChange([...pollOptions, ''])}
          >
            <Plus size={14} /> 添加选项
          </Button>
        )}
      </section>
    );
  }

  if (postType === 'bounty') {
    const showBalance = !disabled && typeof userPointsBalance === 'number';
    const balance = userPointsBalance ?? 0;
    const overBudget = showBalance && bountyPoints > balance;
    const remaining = showBalance && bountyPoints > 0 && !overBudget
      ? balance - bountyPoints
      : null;

    return (
      <section className="compose-special" aria-label="悬赏设置">
        <Label htmlFor="bounty-points">悬赏积分（发布即扣除）</Label>
        <div className="compose-special__bounty-row">
          <Input
            id="bounty-points"
            type="number"
            min={1}
            value={bountyPoints || ''}
            disabled={disabled}
            onChange={e => onBountyPointsChange(Math.max(0, Number(e.target.value) || 0))}
          />
          {showBalance && (
            <p className={cn(
              'compose-special__balance',
              overBudget && 'compose-special__balance--over',
            )}
            >
              {overBudget
                ? '积分不足'
                : remaining != null
                  ? `当前余额 ${balance} · 发布后剩余 ${remaining}`
                  : `当前余额 ${balance}`}
            </p>
          )}
        </div>
      </section>
    );
  }

  if (postType === 'lottery') {
    return (
      <section className="compose-special" aria-label="抽奖设置">
        <Label htmlFor="lottery-winners">中奖人数（1-20）</Label>
        <Input
          id="lottery-winners"
          type="number"
          min={1}
          max={20}
          value={lotteryWinners || 1}
          disabled={disabled}
          onChange={e => onLotteryWinnersChange(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
        />
        <p className="compose-special__hint">参与者为已回帖用户（不含楼主），由作者或管理员开奖</p>
      </section>
    );
  }

  return null;
}

export function buildPollOptionsPayload(
  options: string[],
  multi: boolean,
  maxChoices: number,
  endsAtISO?: string | null,
): string {
  const payload: Record<string, unknown> = {
    multi,
    max_choices: maxChoices,
    options: options.filter(o => o.trim()).map(text => ({ text: text.trim() })),
  };
  if (endsAtISO) payload.ends_at = endsAtISO;
  return JSON.stringify(payload);
}

/** 统计有效（非空）投票选项数量 */
export function countValidPollOptions(options: string[]): number {
  return options.filter(o => o.trim()).length;
}

/** 前端校验投票截止时间（非不限时时） */
export function validatePollEndsAtLocal(local: string): string | null {
  const iso = pollEndsAtLocalToISO(local);
  if (!iso) return '请选择有效的投票截止时间';
  if (new Date(iso).getTime() <= Date.now() + 5 * 60_000) {
    return '投票截止时间须晚于当前时间至少 5 分钟';
  }
  if (new Date(iso).getTime() > Date.now() + 365 * 24 * 3600_000) {
    return '投票截止时间不能超过 365 天';
  }
  return null;
}
