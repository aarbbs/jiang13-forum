import { useEffect, useId, useRef, useState } from 'react';
import { EMOJI_LIST } from '../utils/emojis';

interface Props {
  onSelect: (emoji: string) => void;
  id?: string;
}

/** OwO 表情选择面板（方向键浏览，Enter 选中） */
export default function EmojiPicker({ onSelect, id }: Props) {
  const autoId = useId();
  const listId = id ?? autoId;
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.focus();
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cols = 8;
    let next = active;
    if (e.key === 'ArrowRight') next = Math.min(EMOJI_LIST.length - 1, active + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, active - 1);
    else if (e.key === 'ArrowDown') next = Math.min(EMOJI_LIST.length - 1, active + cols);
    else if (e.key === 'ArrowUp') next = Math.max(0, active - cols);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = EMOJI_LIST.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(EMOJI_LIST[active]);
      return;
    } else {
      return;
    }
    e.preventDefault();
    setActive(next);
  };

  return (
    <div
      id={listId}
      ref={listRef}
      className="emoji-picker"
      role="listbox"
      aria-label="表情列表"
      aria-activedescendant={`${listId}-opt-${active}`}
      onKeyDown={onKeyDown}
    >
      {EMOJI_LIST.map((e, i) => (
        <button
          key={e}
          id={`${listId}-opt-${i}`}
          type="button"
          role="option"
          tabIndex={active === i ? 0 : -1}
          aria-selected={active === i}
          className={`emoji-picker-item${active === i ? ' emoji-picker-item--active' : ''}`}
          aria-label={e}
          onClick={() => onSelect(e)}
          onFocus={() => setActive(i)}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
