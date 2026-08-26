import { useCallback, useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { CheckInStatus } from '../api/types';
import { useAuth } from './useAuth';

/** 每日签到状态与操作（侧栏、积分页等复用） */
export function useCheckIn(enabled = true) {
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState<CheckInStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!user || !enabled) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.checkInStatus()
      .then(d => setStatus(d.check_in))
      .catch(e => notify.error(e instanceof Error ? e.message : '加载签到状态失败'))
      .finally(() => setLoading(false));
  }, [user, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const doCheckIn = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const r = await api.checkIn();
      notify.success(`签到成功，+${r.check_in.today_points} 积分`);
      setStatus(r.check_in);
      await refresh();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '签到失败');
    } finally {
      setBusy(false);
    }
  }, [user, refresh]);

  return {
    status,
    loading,
    busy,
    doCheckIn,
    reload: load,
  };
}
