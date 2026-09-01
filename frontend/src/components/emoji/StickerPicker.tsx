import { useState, useEffect, useId, useRef, useCallback } from 'react';
import {
  STICKER_CATEGORIES,
  loadStickersByCategory,
  type Sticker,
  type StickerCategory,
} from '../../data/stickers';

interface Props {
  onSelect: (sticker: Sticker) => void;
}

/** 贴纸选择面板（分类 Tab + 懒加载 + 键盘导航 + 图片/纯文本混合渲染） */
export default function StickerPicker({ onSelect }: Props) {
  const autoId = useId();
  const [active, setActive] = useState<StickerCategory>('热门');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStickers([]);
    loadStickersByCategory(active)
      .then((list) => {
        if (cancelled) return;
        setStickers(list);
        setFocusIndex(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    if (loading || stickers.length === 0) return;
    gridRef.current?.focus();
  }, [loading, stickers]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = gridRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!items?.length) return;

    const moveTo = (next: number) => {
      e.preventDefault();
      const i = Math.max(0, Math.min(items.length - 1, next));
      setFocusIndex(i);
      items[i]?.focus();
    };

    if (e.key === 'ArrowRight') {
      moveTo(focusIndex + 1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      moveTo(focusIndex - 1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // 颜文字宽度不固定，按视觉行列找下一格，避免按固定 8 列错位
      e.preventDefault();
      const cur = items[focusIndex];
      if (!cur) return;
      const cr = cur.getBoundingClientRect();
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      let best = -1;
      let bestScore = Infinity;
      items.forEach((el, i) => {
        if (i === focusIndex) return;
        const r = el.getBoundingClientRect();
        const dy = (r.top + r.height / 2) - cy;
        if (dy * dir <= 6) return;
        const score = Math.abs(dy) * 24 + Math.abs((r.left + r.width / 2) - cx);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best >= 0) {
        setFocusIndex(best);
        items[best]?.focus();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const s = stickers[focusIndex];
      if (s) onSelect(s);
    }
  }, [stickers, focusIndex, onSelect]);

  return (
    <div className="sticker-picker" role="dialog" aria-label="贴纸选择">
      <div className="sticker-picker-tabs" role="tablist">
        {STICKER_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={active === cat}
            className={`sticker-picker-tab${active === cat ? ' active' : ''}`}
            onClick={() => setActive(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div
        ref={gridRef}
        className="sticker-picker-grid"
        role="listbox"
        tabIndex={0}
        aria-label={`${active}贴纸`}
        aria-activedescendant={`${autoId}-opt-${focusIndex}`}
        onKeyDown={onKeyDown}
      >
        {loading ? (
          <div className="sticker-picker-loading">加载中…</div>
        ) : stickers.length === 0 ? (
          <div className="sticker-picker-loading">暂无贴纸</div>
        ) : (
          stickers.map((s, i) => {
            const isText = s.type === 'text' && !!s.text;
            return (
              <button
                key={s.id}
                id={`${autoId}-opt-${i}`}
                type="button"
                role="option"
                tabIndex={focusIndex === i ? 0 : -1}
                aria-selected={focusIndex === i}
                aria-label={s.name}
                className={isText ? 'sticker-picker-item sticker-picker-item--text' : 'sticker-picker-item sticker-picker-item--image'}
                onClick={() => onSelect(s)}
                onFocus={() => setFocusIndex(i)}
              >
                {isText ? (
                  <span className="sticker-picker-text">{s.text}</span>
                ) : (
                  <img
                    src={s.url}
                    alt={s.name}
                    width={32}
                    height={32}
                    loading="lazy"
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
