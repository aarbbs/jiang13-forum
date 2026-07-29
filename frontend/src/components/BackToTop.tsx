import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

/** 滚动超过该距离后显示按钮 */
const SHOW_THRESHOLD = 320;
/** 路由切换后等待滚动容器挂载的最大重试次数 */
const BIND_RETRY_MAX = 24;
const BIND_RETRY_MS = 50;

/**
 * 定位当前真正滚动的容器。
 * 前台：.post-list-scroll / .page-wrap / .main-content--compose
 * 后台：.admin-main
 */
function pickScrollEl(scope: ParentNode): HTMLElement | null {
  const list = scope.querySelector<HTMLElement>('.post-list-scroll');
  if (list) return list;
  const page = scope.querySelector<HTMLElement>('.page-wrap');
  if (page) return page;
  const compose = scope.querySelector<HTMLElement>('.main-content--compose');
  if (compose) return compose;
  return scope.querySelector<HTMLElement>('.admin-main');
}

function findScrollScope(): ParentNode | null {
  return document.querySelector('.main-content')
    ?? document.querySelector('.admin-shell');
}

export default function BackToTop() {
  const loc = useLocation();
  const [visible, setVisible] = useState(false);
  const scrollElRef = useRef<HTMLElement | null>(null);

  const syncVisible = useCallback(() => {
    const el = scrollElRef.current;
    setVisible(!!el && el.scrollTop > SHOW_THRESHOLD);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let bound: HTMLElement | null = null;

    const onScroll = () => {
      if (!cancelled) syncVisible();
    };

    const unbind = () => {
      if (bound) {
        bound.removeEventListener('scroll', onScroll);
        bound = null;
      }
      scrollElRef.current = null;
    };

    const bind = (el: HTMLElement) => {
      if (bound === el) {
        onScroll();
        return;
      }
      unbind();
      bound = el;
      scrollElRef.current = el;
      el.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    };

    const tryBind = () => {
      if (cancelled) return;
      const scope = findScrollScope();
      if (!scope) {
        setVisible(false);
        return;
      }
      const next = pickScrollEl(scope);
      if (next) {
        bind(next);
        const waitingList =
          !next.classList.contains('post-list-scroll') &&
          !!(scope as Element).querySelector?.('.feed-panel');
        if (waitingList && attempts < BIND_RETRY_MAX) {
          attempts += 1;
          retryTimer = setTimeout(tryBind, BIND_RETRY_MS);
        }
        return;
      }
      unbind();
      setVisible(false);
      if (attempts < BIND_RETRY_MAX) {
        attempts += 1;
        retryTimer = setTimeout(tryBind, BIND_RETRY_MS);
      }
    };

    tryBind();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      unbind();
    };
  }, [loc.pathname, loc.search, syncVisible]);

  const scrollToTop = () => {
    const el = scrollElRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' back-to-top--visible' : ''}`}
      onClick={scrollToTop}
      aria-label="回到顶部"
      title="回到顶部"
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp size={20} strokeWidth={2.25} />
    </button>
  );
}
