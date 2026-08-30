import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useForumLimits } from './useForumLimits';

const DEDUPE_MS = 800;

function shouldSkipPath(pathname: string) {
  const p = pathname.toLowerCase();
  return (
    p === '/admin' ||
    p.startsWith('/admin/') ||
    p === '/login' ||
    p === '/register' ||
    p === '/forgot-password' ||
    p.startsWith('/oauth')
  );
}

/** 主站布局：路由变化时上报第一方 pageview（采集关闭则不请求） */
export function useMonitorPageview() {
  const loc = useLocation();
  const { limits } = useForumLimits();
  const lastRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const enabled = !!limits.monitor_pageview;

  useEffect(() => {
    if (!enabled) return;
    if (shouldSkipPath(loc.pathname)) return;

    const path = `${loc.pathname}${loc.search || ''}`;
    const now = Date.now();
    if (lastRef.current.key === path && now - lastRef.current.at < DEDUPE_MS) {
      return;
    }
    lastRef.current = { key: path, at: now };

    const referrer = typeof document !== 'undefined' ? document.referrer || '' : '';
    void api.monitorPageview({ path, referrer });
  }, [enabled, loc.pathname, loc.search]);
}
