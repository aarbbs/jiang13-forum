import { CalendarCheck, Check, Gift, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCheckIn } from '../hooks/useCheckIn';
import { useAuth } from '../hooks/useAuth';
import { loginPath } from '../utils/authRedirect';

/** 右侧栏首块底部：每日签到 */
export default function AsideCheckInStrip() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { status, loading, busy, doCheckIn } = useCheckIn(!!user && !authLoading);

  // 鉴权未完成：空白，避免「登录签到」→「今日已签到」闪一下
  if (authLoading) {
    return null;
  }

  if (!user) {
    return (
      <div className="widget-checkin">
        <div className="widget-checkin-panel widget-checkin-panel--guest">
          <div className="widget-checkin-main">
            <div className="widget-checkin-icon" aria-hidden>
              <CalendarCheck size={18} strokeWidth={2.25} />
            </div>
            <div className="widget-checkin-info">
              <span className="widget-checkin-title">每日签到</span>
              <span className="widget-checkin-meta">登录后每日可得 5–15 积分</span>
            </div>
          </div>
          <button
            type="button"
            className="widget-checkin-action"
            onClick={() => nav(loginPath())}
          >
            <Gift size={15} aria-hidden />
            登录签到
          </button>
        </div>
      </div>
    );
  }

  // 登录用户：status 未到齐前不渲染最终态
  if (loading || !status) {
    return null;
  }

  const checkedIn = !!status.checked_in;
  const streak = status.streak ?? 0;
  const todayPoints = status.today_points ?? 5;

  const meta = checkedIn
    ? (streak > 0 ? `连续 ${streak} 天 · 今日已获得 ${todayPoints} 积分` : `今日已获得 ${todayPoints} 积分`)
    : (streak > 0 ? `连续 ${streak} 天 · 今日可得 ${todayPoints} 积分` : `今日签到可得 ${todayPoints} 积分`);

  return (
    <div className="widget-checkin">
      <div
        className={`widget-checkin-panel${checkedIn ? ' widget-checkin-panel--done' : ''}`}
      >
        <div className="widget-checkin-main">
          <div className="widget-checkin-icon" aria-hidden>
            {checkedIn ? (
              <Check size={18} strokeWidth={2.5} />
            ) : (
              <CalendarCheck size={18} strokeWidth={2.25} />
            )}
          </div>
          <div className="widget-checkin-info">
            <span className="widget-checkin-title">
              {checkedIn ? '今日已签到' : '每日签到'}
            </span>
            <span className="widget-checkin-meta">{meta}</span>
          </div>
          {!checkedIn && (
            <span className="widget-checkin-reward" aria-hidden>
              {todayPoints}
            </span>
          )}
        </div>
        {!checkedIn && (
          <button
            type="button"
            className="widget-checkin-action"
            disabled={busy}
            onClick={doCheckIn}
          >
            {busy ? (
              <>
                <Loader2 size={15} className="widget-checkin-action-spinner animate-spin" aria-hidden />
                签到中…
              </>
            ) : (
              <>
                <Gift size={15} aria-hidden />
                立即签到
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
