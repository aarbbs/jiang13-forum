import { useRef, useState, type KeyboardEvent } from 'react';
import { Tag, X } from 'lucide-react';
import { notify } from '@/lib/notify';

export function parseTags(raw: string): string[] {
  return raw.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
}

export function serializeTags(list: string[]): string {
  return list.join(',');
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 序列化后的总长度上限，0/undefined 表示不限 */
  maxLength?: number;
  disabled?: boolean;
}

/** 回车 / 逗号确认标签块，悬停显示删除 */
export default function TagInput({
  value,
  onChange,
  placeholder = '输入标签后回车',
  maxLength,
  disabled,
}: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = parseTags(value);
  const commit = (raw: string) => {
    const next = raw.trim();
    if (!next) return false;

    if (tags.some((t) => t.toLowerCase() === next.toLowerCase())) {
      setDraft('');
      return false;
    }

    const merged = serializeTags([...tags, next]);
    if (maxLength && maxLength > 0 && [...merged].length > maxLength) {
      notify.warning(`标签总长不能超过 ${maxLength} 字`);
      return false;
    }

    onChange(merged);
    setDraft('');
    return true;
  };

  const removeAt = (index: number) => {
    onChange(serializeTags(tags.filter((_, i) => i !== index)));
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Backspace' && !draft && tags.length > 0) {
      e.preventDefault();
      removeAt(tags.length - 1);
    }
  };

  const onDraftChange = (text: string) => {
    // 粘贴或输入含分隔符时立即拆成多个标签
    if (/[,，]/.test(text)) {
      const parts = parseTags(text);
      const lastSep = Math.max(text.lastIndexOf(','), text.lastIndexOf('，'));
      const trailing = lastSep >= 0 && lastSep === text.length - 1 ? '' : text.slice(lastSep + 1);
      let list = [...tags];
      for (const p of parts) {
        if (list.some((t) => t.toLowerCase() === p.toLowerCase())) continue;
        const merged = serializeTags([...list, p]);
        if (maxLength && maxLength > 0 && [...merged].length > maxLength) {
          notify.warning(`标签总长不能超过 ${maxLength} 字`);
          break;
        }
        list = [...list, p];
      }
      onChange(serializeTags(list));
      setDraft(trailing.replace(/^[,，]+/, '').trimStart());
      return;
    }
    setDraft(text);
  };

  return (
    <div
      className={`compose-tags-field${disabled ? ' compose-tags-field--disabled' : ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      <Tag className="compose-tags-icon" size={16} aria-hidden />
      <div className="compose-tags-chips">
        {tags.map((tag, i) => (
          <span key={`${tag}-${i}`} className="compose-tag-chip">
            <span className="compose-tag-chip-label">{tag}</span>
            <button
              type="button"
              className="compose-tag-chip-remove"
              aria-label={`删除标签 ${tag}`}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
            >
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="compose-tags-input"
          placeholder={tags.length === 0 ? placeholder : '继续添加…'}
          value={draft}
          disabled={disabled}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
        />
      </div>
    </div>
  );
}
