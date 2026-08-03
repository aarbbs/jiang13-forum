import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

/** 触发刷新的下拉距离（px） */
const REFRESH_THRESHOLD = 68;
/** 指示器最大位移 */
const PULL_MAX = 108;
/** 判定为「下拉」意图的最小位移，避免误触滚动 */
const ARM_DELTA = 10;

/**
 * 定位当前真正滚动的容器。
 * SPA 使用内部滚动（body overflow:hidden），原生下拉刷新不可用，需挂到此容器。
 */
function pickScrollEl(): HTMLElement | null {
  const list = document.querySelector<HTMLElement>('.post-list-scroll');
  if (list) return list;

  const page = document.querySelector<HTMLElement>('.page-wrap:not(.page-wrap--feed)');
  if (page) return page;

  const compose = document.querySelector<HTMLElement>('.main-content--compose');
  if (compose) return compose;

  const admin = document.querySelector<HTMLElement>('.admin-main');
  if (admin) return admin;

  const auth = document.querySelector<HTMLElement>('.auth-page');
  if (auth) return auth;

  return null;
}

function isTouchDevice(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
    || navigator.maxTouchPoints > 0;
}

/**
 * 手机端下拉刷新：在内部滚动容器顶部下拉后整页重载。
 * （浏览器原生 PTR 依赖 document 滚动，与本站 app-shell 布局不兼容。）
 *
 * 挂在 Router 外，故用 MutationObserver 在路由切换后重绑滚动容器。
 */
export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const pullingRef = useRef(false);
  const scrollElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (!isTouchDevice()) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let bound: HTMLElement | null = null;

    const resetGesture = () => {
      trackingRef.current = false;
      pullingRef.current = false;
      startYRef.current = 0;
      if (!refreshingRef.current) setPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      const el = scrollElRef.current;
      if (!el || el.scrollTop > 1) return;
      if (document.querySelector(
        '.sidebar-drawer-root, .aside-drawer-root, .image-lightbox, [aria-modal="true"]',
      )) {
        return;
      }
      trackingRef.current = true;
      pullingRef.current = false;
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current || e.touches.length !== 1) return;
      const el = scrollElRef.current;
      if (!el) return;

      if (el.scrollTop > 1) {
        resetGesture();
        return;
      }

      const dy = e.touches[0].clientY - startYRef.current;
      if (dy < ARM_DELTA) {
        if (pullingRef.current && dy <= 0) resetGesture();
        return;
      }

      pullingRef.current = true;
      setPull(Math.min(PULL_MAX, dy * 0.55));
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!trackingRef.current) return;
      const shouldRefresh = pullingRef.current && pullRef.current >= REFRESH_THRESHOLD;
      trackingRef.current = false;
      pullingRef.current = false;

      if (shouldRefresh) {
        setRefreshing(true);
        setPull(REFRESH_THRESHOLD * 0.7);
        window.setTimeout(() => {
          window.location.reload();
        }, 180);
        return;
      }
      setPull(0);
    };

    const unbind = () => {
      if (!bound) return;
      bound.removeEventListener('touchstart', onTouchStart);
      bound.removeEventListener('touchmove', onTouchMove);
      bound.removeEventListener('touchend', onTouchEnd);
      bound.removeEventListener('touchcancel', onTouchEnd);
      bound = null;
    };

    const bind = (el: HTMLElement) => {
      if (bound === el) return;
      unbind();
      bound = el;
      scrollElRef.current = el;
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    };

    const tryBind = () => {
      if (cancelled) return;
      const next = pickScrollEl();
      if (next) bind(next);
    };

    const scheduleBind = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tryBind, 40);
    };

    tryBind();

    const root = document.getElementById('root') ?? document.body;
    const mo = new MutationObserver(scheduleBind);
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener('popstate', scheduleBind);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      mo.disconnect();
      window.removeEventListener('popstate', scheduleBind);
      unbind();
      scrollElRef.current = null;
      trackingRef.current = false;
      pullingRef.current = false;
    };
  }, []);

  if (!refreshing && pull <= 0) return null;

  const ready = pull >= REFRESH_THRESHOLD || refreshing;
  const offset = Math.max(pull, refreshing ? 48 : 0);

  return (
    <div
      className={`ptr-indicator${ready ? ' ptr-indicator--ready' : ''}${refreshing ? ' ptr-indicator--refreshing' : ''}`}
      style={{ transform: `translateY(${offset}px)` }}
      aria-hidden
    >
      <div className="ptr-indicator__chip">
        {refreshing ? (
          <Loader2 size={18} className="ptr-indicator__spin" aria-hidden />
        ) : (
          <ArrowDown
            size={18}
            className="ptr-indicator__arrow"
            style={{ transform: ready ? 'rotate(180deg)' : undefined }}
            aria-hidden
          />
        )}
        <span>{refreshing ? '刷新中…' : ready ? '松开刷新' : '下拉刷新'}</span>
      </div>
    </div>
  );
}
