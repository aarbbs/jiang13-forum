import { applyTextareaChange } from './markdownIndent';

type ChangeHandler = (value: string) => void;

/** 在选区两侧包裹 Markdown 标记 */
export function wrapMarkdownSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  prefix: string,
  suffix: string,
  placeholder: string,
  onChange: ChangeHandler,
) {
  const { selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const text = selected || placeholder;
  const insert = prefix + text + suffix;
  const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
  const newStart = selectionStart + prefix.length;
  const newEnd = newStart + text.length;
  applyTextareaChange(textarea, next, newStart, newEnd, onChange);
}

/** 为当前行或选区行添加前缀（如引用） */
export function prefixMarkdownLines(
  textarea: HTMLTextAreaElement,
  value: string,
  prefix: string,
  onChange: ChangeHandler,
) {
  const { selectionStart, selectionEnd } = textarea;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const nextNewline = value.indexOf('\n', selectionEnd);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n').map(line => `${prefix}${line}`);
  const next = value.slice(0, lineStart) + lines.join('\n') + value.slice(lineEnd);
  applyTextareaChange(
    textarea,
    next,
    selectionStart + prefix.length,
    selectionEnd + prefix.length * lines.length,
    onChange,
  );
}

/** 切换当前行标题级别（源码模式） */
export function cycleMarkdownHeading(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: ChangeHandler,
) {
  const { selectionStart } = textarea;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEnd = value.indexOf('\n', selectionStart);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const line = value.slice(lineStart, end);
  const match = line.match(/^(#{2,6})\s+(.*)$/);
  let nextLine: string;
  if (!match) {
    nextLine = `## ${line}`;
  } else {
    const level = match[1].length;
    const body = match[2];
    nextLine = level >= 6 ? body : `${'#'.repeat(level + 1)} ${body}`;
  }
  const next = value.slice(0, lineStart) + nextLine + value.slice(end);
  const offset = nextLine.length - line.length;
  applyTextareaChange(
    textarea,
    next,
    selectionStart + Math.max(0, offset),
    selectionStart + Math.max(0, offset),
    onChange,
  );
}

/** 插入登录可见区块模板 */
export function insertMarkdownMembersOnly(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: ChangeHandler,
) {
  const { selectionStart, selectionEnd } = textarea;
  const snippet = '\n\n<members-only>\n\n\n</members-only>\n\n';
  const next = value.slice(0, selectionStart) + snippet + value.slice(selectionEnd);
  const cursor = selectionStart + '\n\n<members-only>\n\n'.length;
  applyTextareaChange(textarea, next, cursor, cursor, onChange);
}

/** 在光标处插入链接 Markdown */
export function insertMarkdownLink(
  textarea: HTMLTextAreaElement,
  value: string,
  url: string,
  onChange: ChangeHandler,
) {
  const { selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd) || '链接文字';
  const insert = `[${selected}](${url})`;
  const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
  applyTextareaChange(
    textarea,
    next,
    selectionStart + insert.length,
    selectionStart + insert.length,
    onChange,
  );
}
