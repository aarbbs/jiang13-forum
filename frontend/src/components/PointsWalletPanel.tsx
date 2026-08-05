import { useCallback, useEffect, useState } from 'react';
import { Coins, Dices, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { CheckInStatus, LotteryStatus, PointLedger } from '../api/types';
import { useAuth } from '../hooks/useAuth';

const REASON_LABEL: Record<string, string> = {
  check_in: '签到',
  lottery: '抽奖',
  unlock_spend: '解锁内容',
  creator_income: '创作分成',
  admin_adjust: '站长调账',
};

/** 个人中心：积分余额、签到、抽奖、流水 */
export default function PointsWalletPanel() {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(0);
  const [income, setIncome] = useState(0);
  const [checkIn, setCheckIn] = useState<CheckInStatus | null>(null);
  const [lottery, setLottery] = useState<LotteryStatus | null>(null);
  const [ledger, setLedger] = useState<PointLedger[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.mePoints(1)
      .then(d => {
        setPoints(d.points);
        setIncome(d.creator_income_total);
        setCheckIn(d.check_in);
        setLottery(d.lottery);
        setLedger(d.ledger ?? []);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const doCheckIn = async () => {
    setBusy(true);
    try {
      const r = await api.checkIn();
      notify.success(`签到成功，+${r.check_in.today_points} 积分`);
      setPoints(r.points);
      setCheckIn(r.check_in);
      await refresh();
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '签到失败');
    } finally {
      setBusy(false);
    }
  };

  const doLottery = async () => {
    setBusy(true);
    try {
      const r = await api.lotteryDraw();
      notify.success(r.lottery.points > 0 ? `抽中 ${r.lottery.points} 积分` : '未中奖，明天再来');
      setPoints(r.points);
      setLottery(r.lottery);
      await refresh();
      load();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '抽奖失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="points-wallet">
        <div className="flex justify-center py-8"><Spinner /></div>
      </div>
    );
  }

  return (
    <div className="points-wallet">
      <div className="points-wallet-head">
        <h3>
          <Coins size={18} aria-hidden />
          积分钱包
        </h3>
        <div className="points-wallet-balance">
          <strong>{points}</strong>
          <span>可用积分</span>
          <em title="累计创作分成">创作收入 {income}</em>
        </div>
      </div>

      <div className="points-wallet-actions">
        <Button
          size="sm"
          disabled={busy || !!checkIn?.checked_in}
          onClick={doCheckIn}
        >
          <Gift size={14} />
          {checkIn?.checked_in
            ? `已签到（连续 ${checkIn.streak} 天）`
            : `签到 +${checkIn?.today_points ?? 5}`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !!lottery?.drawn}
          onClick={doLottery}
        >
          <Dices size={14} />
          {lottery?.drawn ? `今日已抽（${lottery.points}）` : '每日抽奖'}
        </Button>
      </div>

      <div className="points-wallet-ledger">
        <h4>最近流水</h4>
        {ledger.length === 0 && <p className="points-wallet-empty">暂无流水</p>}
        <ul>
          {ledger.map(row => (
            <li key={row.id}>
              <span className={row.delta >= 0 ? 'pos' : 'neg'}>
                {row.delta >= 0 ? '+' : ''}{row.delta}
              </span>
              <span>{REASON_LABEL[row.reason] || row.reason}</span>
              <time>{new Date(row.created_at).toLocaleString('zh-CN')}</time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
