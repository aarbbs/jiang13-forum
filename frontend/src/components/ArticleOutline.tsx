import { useEffect, useMemo, useRef, useState } from 'react';
import { ListTree } from 'lucide-react';
import type { PostHeading } from '../utils/postHeadings';
import { cn } from '@/lib/utils';

interface Props {
  headings: PostHeading[];
  /** 滚动容器；不传则用 viewport */
  scrollRoot?: HTMLElement | null;
  title?: string;
  className?: string;
}

/** 根据滚动位置取当前应高亮的标题 id */
function resolveActiveHeadingId(
  headings: PostHeading[],
  root: HTMLElement | null,
  offsetPx = 28,
): string {
  if (headings.length === 0) return '';

  const rootTop = root ? root.getBoundingClientRect().top : 0;
  const marker = rootTop + offsetPx;

  let current = headings[0].id;
  for (const h of headings) {
    const el = document.getElementById(h.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= marker) {
      current = h.id;
    } else {
      break;
    }
  }
  return current;
}

/** 文章目录树：点击跳转，滚动时高亮当前标题 */
export default function ArticleOutline({
  headings,
  scrollRoot,
  title = '文章目录',
  className,
}: Props) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? '');
  /** 点击跳转期间锁定高亮，避免 Intersection/滚动回调来回抢 */
  const lockUntilRef = useRef(0);
  const lockIdRef = useRef('');
  const rafRef = useRef(0);

  const minLevel = useMemo(
    () => (headings.length ? Math.min(...headings.map(h => h.level)) : 2),
    [headings],
  );

  useEffect(() => {
    setActiveId(headings[0]?.id ?? '');
    lockUntilRef.current = 0;
    lockIdRef.current = '';
  }, [headings]);

  useEffect(() => {
    if (headings.length === 0) return undefined;

    const root: HTMLElement | Window = scrollRoot ?? window;

    const syncActive = () => {
      if (Date.now() < lockUntilRef.current) {
        if (lockIdRef.current) setActiveId(lockIdRef.current);
        return;
      }
      const next = resolveActiveHeadingId(headings, scrollRoot ?? null);
      if (next) setActiveId(next);
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(syncActive);
    };

    syncActive();
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [headings, scrollRoot]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    // 立即高亮并锁定一段时间，覆盖 smooth 滚动过程中的中间态
    setActiveId(id);
    lockIdRef.current = id;
    lockUntilRef.current = Date.now() + 900;

    const root = scrollRoot;
    if (root) {
      const rootRect = root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const top = root.scrollTop + (elRect.top - rootRect.top) - 12;
      root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 滚动结束后再按位置校正一次（若用户中途手动滑会自然解锁）
    window.setTimeout(() => {
      if (lockIdRef.current !== id) return;
      lockUntilRef.current = 0;
      const next = resolveActiveHeadingId(headings, scrollRoot ?? null);
      if (next) setActiveId(next);
    }, 920);
  };

  return (
    <div className={cn('article-outline', className)}>
      <div className="sidebar-section article-outline-head">
        <ListTree size={12} aria-hidden />
        <span>{title}</span>
      </div>
      {headings.length === 0 ? (
        <p className="article-outline-empty">本文暂无标题结构</p>
      ) : (
        <nav className="article-outline-nav" aria-label="文章目录">
          {headings.map(h => (
            <button
              key={h.id}
              type="button"
              className={cn(
                'article-outline-item',
                `article-outline-item--l${Math.min(6, Math.max(1, h.level - minLevel + 1))}`,
                activeId === h.id && 'active',
              )}
              onClick={() => jumpTo(h.id)}
              title={h.text}
            >
              {h.text}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
