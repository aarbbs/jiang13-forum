import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { Sticker } from '../data/stickers';

export type PmComposerInputHandle = {
  insertSticker: (sticker: Sticker) => void;
  insertText: (text: string) => void;
  focus: () => void;
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  onSubmit?: () => void;
};

/** 站点内置贴纸路径（评论/私信共用） */
export function isPmStickerSrc(src: string) {
  return src.includes('/stickers/');
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function draftToHtml(text: string): string {
  if (!text) return '';
  const parts = text.split(/(!\[[^\]]*]\([^)]+\))/g);
  return parts.map((part) => {
    const m = part.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
    if (m) {
      const alt = escapeHtml(m[1] || '表情');
      const src = escapeHtml(m[2]);
      const cls = isPmStickerSrc(m[2]) ? 'pm-composer__sticker' : 'pm-composer__inline-img';
      return `<img class="${cls}" src="${src}" alt="${alt}" draggable="false">`;
    }
    return escapeHtml(part).replace(/\n/g, '<br>');
  }).join('');
}

function serializeComposer(root: HTMLElement): string {
  let out = '';

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'IMG') {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '表情';
      out += `![${alt}](${src})`;
      return;
    }
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    if (tag === 'DIV' || tag === 'P') {
      if (out.length > 0 && !out.endsWith('\n')) out += '\n';
      el.childNodes.forEach(walk);
      return;
    }
    el.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);
  return out.replace(/\n$/, '');
}

function placeCaretAfter(node: Node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 私信输入框：可内联插入贴纸（与评论编辑器一致），序列化为 markdown 图片语法 */
const PmComposerInput = forwardRef<PmComposerInputHandle, Props>(function PmComposerInput(
  { value, onChange, placeholder, maxLength = 4000, disabled, onSubmit },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const emit = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const next = serializeComposer(el);
    if (maxLength && next.length > maxLength) {
      el.innerHTML = draftToHtml(valueRef.current);
      return;
    }
    el.dataset.empty = next ? 'false' : 'true';
    if (next !== valueRef.current) onChange(next);
  }, [maxLength, onChange]);

  const restoreRange = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const saved = savedRangeRef.current;
    if (saved && el.contains(saved.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(saved);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const saveRange = useCallback(() => {
    const el = elRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    if (!el.contains(sel.anchorNode)) return;
    savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  }, []);

  const insertNodes = useCallback((nodes: Node[]) => {
    const el = elRef.current;
    if (!el || !nodes.length) return;
    restoreRange();
    const sel = window.getSelection();
    if (!sel) return;
    const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : document.createRange();
    range.deleteContents();
    const frag = document.createDocumentFragment();
    nodes.forEach((n) => frag.appendChild(n));
    const last = nodes[nodes.length - 1];
    range.insertNode(frag);
    placeCaretAfter(last);
    saveRange();
    emit();
  }, [emit, restoreRange, saveRange]);

  useImperativeHandle(ref, () => ({
    insertSticker(sticker) {
      if (!sticker.url) return;
      const img = document.createElement('img');
      img.className = 'pm-composer__sticker';
      img.src = sticker.url;
      img.alt = sticker.name || '表情';
      img.draggable = false;
      // 尾随空格，光标可停在贴纸右侧（对齐评论编辑器）
      insertNodes([img, document.createTextNode(' ')]);
    },
    insertText(text) {
      if (!text) return;
      insertNodes([document.createTextNode(text)]);
    },
    focus() {
      restoreRange();
    },
  }), [insertNodes, restoreRange]);

  // 外部改 value（切会话 / 发送清空）时回填；输入过程中 serialize 与 value 一致则不重绘
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (serializeComposer(el) === value) {
      el.dataset.empty = value ? 'false' : 'true';
      return;
    }
    el.innerHTML = draftToHtml(value);
    el.dataset.empty = value ? 'false' : 'true';
  }, [value]);

  useEffect(() => {
    const onSel = () => saveRange();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [saveRange]);

  return (
    <div
      ref={elRef}
      className="pm-composer__input"
      role="textbox"
      aria-multiline="true"
      aria-label="私信内容"
      contentEditable={!disabled}
      data-placeholder={placeholder || ''}
      data-empty={value ? 'false' : 'true'}
      suppressContentEditableWarning
      onInput={emit}
      onBlur={saveRange}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        if (text) insertNodes([document.createTextNode(text)]);
      }}
      onDrop={(e) => {
        // 禁止把文件拖成「大图附件」；贴纸只走选择器
        if (e.dataTransfer?.files?.length) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit?.();
        }
      }}
    />
  );
});

export default PmComposerInput;
