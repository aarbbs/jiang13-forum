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
    const el = gridRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[focusIndex];
    el?.focus();
  }, [focusIndex, stickers]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const cols = 8;
    if (e.key === 'ArrowRight') { e.preventDefault(); setFocusIndex((i) => Math.min(stickers.length - 1, i + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setFocusIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIndex((i) => Math.min(stickers.length - 1, i + cols)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIndex((i) => Math.max(0, i - cols)); }
    else if (e.key === 'Enter' || e.key === ' ') {
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
        aria-label={`${active}贴纸`}
        aria-activedescendant={`${autoId}-opt-${focusIndex}`}
        onKeyDown={onKeyDown}
      >
        {loading ? (
          <div className="sticker-picker-loading">加载中…</div>
        ) : stickers.length === 0 ? (
          <div className="sticker-picker-loading">暂无贴纸</div>
        ) : (
          stickers.map((s, i) => (
            <button
              key={s.id}
              id={`${autoId}-opt-${i}`}
              type="button"
              role="option"
              tabIndex={focusIndex === i ? 0 : -1}
              aria-selected={focusIndex === i}
              aria-label={s.name}
              className="sticker-picker-item"
              onClick={() => onSelect(s)}
              onFocus={() => setFocusIndex(i)}
            >
              {s.type === 'text' && s.text ? (
                <span className="sticker-picker-text">{s.text}</span>
              ) : (
                <img
                  src={s.url}
                  alt={s.name}
                  width={32}
                  height={32}
                  style={{ width: 32, height: 32, objectFit: 'contain' }}
                  loading="lazy"
                />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
