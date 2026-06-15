export const TAB_SPACES = '    ';

interface LineRange {
  lineStart: number;
  lineEnd: number;
}

/** 获取选区覆盖的整行文本范围 */
function getLineRange(value: string, start: number, end: number): LineRange {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextNewline = value.indexOf('\n', end);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  return { lineStart, lineEnd };
}

/** 多行整体增加一级缩进 */
function indentBlock(value: string, lineStart: number, lineEnd: number): string {
  const block = value.slice(lineStart, lineEnd);
  const indented = block.split('\n').map(line => TAB_SPACES + line).join('\n');
  return value.slice(0, lineStart) + indented + value.slice(lineEnd);
}

/** 多行整体减少一级缩进，返回新文本及选区偏移 */
function outdentBlock(
  value: string,
  lineStart: number,
  lineEnd: number,
  selectionStart: number,
  selectionEnd: number,
): { next: string; newStart: number; newEnd: number } {
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  let cursor = lineStart;
  let newStart = selectionStart;
  let newEnd = selectionEnd;

  const outdented = lines.map(line => {
    const match = line.match(/^ {1,4}/);
    const removed = match ? match[0].length : 0;
    if (removed > 0) {
      if (selectionStart > cursor) {
        newStart -= Math.min(removed, selectionStart - cursor);
      }
      if (selectionEnd > cursor) {
        newEnd -= Math.min(removed, selectionEnd - cursor);
      }
    }
    cursor += line.length + 1;
    return line.replace(/^ {1,4}/, '');
  }).join('\n');

  return {
    next: value.slice(0, lineStart) + outdented + value.slice(lineEnd),
    newStart: Math.max(lineStart, newStart),
    newEnd: Math.max(lineStart, newEnd),
  };
}

/** 在光标处插入文本并恢复选区 */
export function applyTextareaChange(
  textarea: HTMLTextAreaElement,
  nextValue: string,
  cursorStart: number,
  cursorEnd = cursorStart,
  onChange: (value: string) => void,
) {
  onChange(nextValue);
  requestAnimationFrame(() => {
    textarea.selectionStart = cursorStart;
    textarea.selectionEnd = cursorEnd;
    textarea.focus();
  });
}

/** 在 textarea 光标处插入文本 */
export function insertAtCursor(
  textarea: HTMLTextAreaElement,
  currentValue: string,
  insertText: string,
  onChange: (value: string) => void,
) {
  const { selectionStart, selectionEnd } = textarea;
  const next = currentValue.slice(0, selectionStart) + insertText + currentValue.slice(selectionEnd);
  const cursor = selectionStart + insertText.length;
  applyTextareaChange(textarea, next, cursor, cursor, onChange);
}

/** Markdown 源码 Tab / Shift+Tab 缩进 */
export function handleMarkdownTabKey(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  onChange: (value: string) => void,
) {
  if (e.key !== 'Tab') return;

  e.preventDefault();
  const textarea = e.currentTarget;
  const { selectionStart, selectionEnd, value } = textarea;
  const { lineStart, lineEnd } = getLineRange(value, selectionStart, selectionEnd);
  const hasSelection = selectionStart !== selectionEnd;
  const block = value.slice(lineStart, lineEnd);
  const multiLine = hasSelection && block.split('\n').length > 1;

  if (e.shiftKey) {
    if (multiLine) {
      const { next, newStart, newEnd } = outdentBlock(value, lineStart, lineEnd, selectionStart, selectionEnd);
      applyTextareaChange(textarea, next, newStart, newEnd, onChange);
      return;
    }

    const lineText = value.slice(lineStart, selectionStart);
    const trailingMatch = lineText.match(/ {1,4}$/);
    if (trailingMatch) {
      const removeLen = trailingMatch[0].length;
      const next = value.slice(0, selectionStart - removeLen) + value.slice(selectionStart);
      applyTextareaChange(textarea, next, selectionStart - removeLen, selectionEnd - removeLen, onChange);
      return;
    }

    const leadingMatch = value.slice(lineStart, selectionStart).match(/^ {1,4}/);
    if (leadingMatch) {
      const removeLen = leadingMatch[0].length;
      const next = value.slice(0, lineStart) + value.slice(lineStart + removeLen);
      applyTextareaChange(
        textarea,
        next,
        selectionStart - removeLen,
        selectionEnd - removeLen,
        onChange,
      );
    }
    return;
  }

  if (multiLine) {
    const next = indentBlock(value, lineStart, lineEnd);
    const lineCount = value.slice(lineStart, lineEnd).split('\n').length;
    applyTextareaChange(
      textarea,
      next,
      selectionStart + TAB_SPACES.length,
      selectionEnd + TAB_SPACES.length * lineCount,
      onChange,
    );
    return;
  }

  const next = value.slice(0, selectionStart) + TAB_SPACES + value.slice(selectionEnd);
  applyTextareaChange(textarea, next, selectionStart + TAB_SPACES.length, selectionStart + TAB_SPACES.length, onChange);
}
