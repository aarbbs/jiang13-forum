import { useCallback, useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { CheckInStatus } from '../api/types';
import { getSessionSnapshot, setSessionSnapshot } from '../utils/sessionPageCache';
import { PAGE_FORCE_REFRESH_EVENT } from '../utils/feedCache';
import { PAGE_SOFT_REFRESH_COMMIT_EVENT } from '../utils/softRefresh';
import { useAuth } from './useAuth';

/** 签到会话快照键（与 prefetchRoute 共用） */
export function checkInCacheKey(userId: number) {
  return `checkin:${userId}`;
}

/** 每日签到状态与操作（侧栏、积分页等复用） */
export function useCheckIn(enabled = true) {
  const { user, refresh } = useAuth();
  const userId = user?.id;

  const [status, setStatus] = useState<CheckInStatus | null>(() => {
    if (!userId || !enabled) return null;
    return getSessionSnapshot<CheckInStatus>(checkInCacheKey(userId)) ?? null;
  });
  const [loading, setLoading] = useState(() => {
    if (!userId || !enabled) return false;
    return getSessionSnapshot<CheckInStatus>(checkInCacheKey(userId)) === undefined;
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback((opts?: { force?: boolean }) => {
    if (!userId || !enabled) {
      setStatus(null);
      setLoading(false);
      return;
    }
    const key = checkInCacheKey(userId);
    if (!opts?.force) {
      const hit = getSessionSnapshot<CheckInStatus>(key);
      if (hit !== undefined) {
        setStatus(hit);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    api.checkInStatus()
      .then((d) => {
        setSessionSnapshot(key, d.check_in);
        setStatus(d.check_in);
      })
      .catch((e) => notify.error(e instanceof Error ? e.message : '加载签到状态失败'))
      .finally(() => setLoading(false));
  }, [userId, enabled]);

  useEffect(() => {
    if (!userId || !enabled) {
      setStatus(null);
      setLoading(false);
      return;
    }
    const key = checkInCacheKey(userId);
    const hit = getSessionSnapshot<CheckInStatus>(key);
    if (hit !== undefined) {
      setStatus(hit);
      setLoading(false);
      return;
    }
    setStatus(null);
    setLoading(true);
    load({ force: true });
  }, [userId, enabled, load]);

  // 软刷新 commit：仅快照命中才盖；未命中保持旧 UI，后台静默再拉
  useEffect(() => {
    const applyHitOrSilent = (forceLoading: boolean) => {
      if (!userId || !enabled) return;
      const key = checkInCacheKey(userId);
      const hit = getSessionSnapshot<CheckInStatus>(key);
      if (hit !== undefined) {
        setStatus(hit);
        setLoading(false);
        return;
      }
      if (forceLoading) {
        load({ force: true });
        return;
      }
      // 软刷新未命中：不 setLoading，静默覆盖
      api.checkInStatus()
        .then((d) => {
          setSessionSnapshot(key, d.check_in);
          setStatus(d.check_in);
          setLoading(false);
        })
        .catch(() => { /* 保持旧 UI */ });
    };
    const onForce = () => applyHitOrSilent(true);
    const onCommit = () => applyHitOrSilent(false);
    window.addEventListener(PAGE_FORCE_REFRESH_EVENT, onForce);
    window.addEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, onCommit);
    return () => {
      window.removeEventListener(PAGE_FORCE_REFRESH_EVENT, onForce);
      window.removeEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, onCommit);
    };
  }, [userId, enabled, load]);

  const doCheckIn = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const r = await api.checkIn();
      notify.success(`签到成功，+${r.check_in.today_points} 积分`);
      setSessionSnapshot(checkInCacheKey(userId), r.check_in);
      setStatus(r.check_in);
      await refresh();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '签到失败');
    } finally {
      setBusy(false);
    }
  }, [userId, refresh]);

  return {
    status,
    loading,
    busy,
    doCheckIn,
    reload: () => load({ force: true }),
  };
}
