import {
  useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo, type ReactNode,
} from 'react';
import {
  Bold, Italic, Strikethrough, Link, Code, Quote,
  List, ListOrdered, Image, Eye, Pencil, Minus, LockKeyhole,
} from 'lucide-react';
import { markdownToHtml, countWords } from '../utils/markdown';
import { renderPostContentHtml } from '../utils/postContent';

export interface ArticleEditorHandle {
  getHTML: () => string;
  getMarkdown: () => string;
  isEmpty: () => boolean;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

type ViewMode = 'edit' | 'preview' | 'split';

interface ToolBtn {
  icon: ReactNode;
  title: string;
  action: () => void;
}

/** 去掉行首已有的 Markdown 块级前缀 */
function stripLinePrefix(line: string): string {
  return line
    .replace(/^\r/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s*/, '')
    .replace(/^\d+\.\s*/, '');
}

const ArticleEditor = forwardRef<ArticleEditorHandle, Props>(function ArticleEditor(
  { value, onChange, placeholder = '在此撰写正文…' },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [previewHtml, setPreviewHtml] = useState('');

  useImperativeHandle(ref, () => ({
    getHTML: () => markdownToHtml(value),
    getMarkdown: () => value,
    isEmpty: () => value.trim().length === 0,
    focus: () => textareaRef.current?.focus(),
  }));

  const saveSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    selectionRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
  }, []);

  const getSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (ta && document.activeElement === ta) {
      return { start: ta.selectionStart, end: ta.selectionEnd };
    }
    return selectionRef.current;
  }, []);

  const restoreSelection = useCallback((start: number, end = start) => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
      selectionRef.current = { start, end };
    });
  }, []);

  // 实时预览，短 debounce 保证流畅
  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(markdownToHtml(value)), 60);
    return () => clearTimeout(t);
  }, [value]);

  // 编辑区随内容向下延伸，最小高度撑满视口剩余空间
  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || viewMode === 'preview') return;
    ta.style.height = '0px';
    const contentHeight = ta.scrollHeight;
    const top = ta.getBoundingClientRect().top;
    const minHeight = Math.max(280, window.innerHeight - top - 56);
    ta.style.height = `${Math.max(minHeight, contentHeight)}px`;
  }, [viewMode]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [value, viewMode, adjustTextareaHeight]);

  useEffect(() => {
    const onResize = () => adjustTextareaHeight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [adjustTextareaHeight]);

  const insertAtCursor = useCallback((before: string, after = '', placeholderText = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end } = getSelection();
    const selected = value.slice(start, end) || placeholderText;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    restoreSelection(start + before.length + selected.length);
  }, [value, onChange, getSelection, restoreSelection]);

  const wrapLine = useCallback((prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start } = getSelection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const end = lineEnd === -1 ? value.length : lineEnd;
    const line = value.slice(lineStart, end);
    const stripped = stripLinePrefix(line);
    const next = value.slice(0, lineStart) + prefix + stripped + value.slice(end);
    onChange(next);
    restoreSelection(lineStart + prefix.length + stripped.length);
  }, [value, onChange, getSelection, restoreSelection]);

  /** 标题：无 → H2 → H3 → … → H6 → 取消 */
  const toggleHeading = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start } = getSelection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const end = lineEnd === -1 ? value.length : lineEnd;
    const line = value.slice(lineStart, end);
    const normalized = line.replace(/^\r/, '');
    const match = normalized.match(/^(#{1,6})\s+(.*)$/);

    let nextLine: string;
    if (match) {
      const level = match[1].length;
      const text = match[2];
      nextLine = level >= 6 ? text : `${'#'.repeat(level + 1)} ${text}`;
    } else {
      nextLine = `## ${stripLinePrefix(normalized)}`;
    }

    const next = value.slice(0, lineStart) + nextLine + value.slice(end);
    onChange(next);
    const cursor = lineStart + nextLine.length;
    restoreSelection(cursor);
  }, [value, onChange, getSelection, restoreSelection]);

  /** 包裹为仅登录用户可见区块 */
  const wrapMembersOnly = useCallback(() => {
    const { start, end } = getSelection();
    if (start !== end) {
      const selected = value.slice(start, end);
      const block = `\n:::members\n${selected}\n:::\n`;
      const next = value.slice(0, start) + block + value.slice(end);
      onChange(next);
      restoreSelection(start + ':::members\n'.length + 1);
      return;
    }
    insertAtCursor('\n:::members\n', '\n:::\n', '在此输入仅登录用户可见的内容…');
  }, [value, onChange, getSelection, restoreSelection, insertAtCursor]);

  const tools: ToolBtn[] = [
    { icon: <strong>H</strong>, title: '标题（H2，再次点击升级）', action: toggleHeading },
    { icon: <Bold size={15} />, title: '加粗', action: () => insertAtCursor('**', '**', '加粗') },
    { icon: <Italic size={15} />, title: '斜体', action: () => insertAtCursor('*', '*', '斜体') },
    { icon: <Strikethrough size={15} />, title: '删除线', action: () => insertAtCursor('~~', '~~', '删除') },
    { icon: <Minus size={15} />, title: '分割线', action: () => insertAtCursor('\n\n---\n\n') },
    { icon: <Quote size={15} />, title: '引用', action: () => wrapLine('> ') },
    { icon: <List size={15} />, title: '无序列表', action: () => wrapLine('- ') },
    { icon: <ListOrdered size={15} />, title: '有序列表', action: () => wrapLine('1. ') },
    { icon: <Code size={15} />, title: '代码块', action: () => insertAtCursor('\n```\n', '\n```\n', 'code') },
    { icon: <Link size={15} />, title: '链接', action: () => insertAtCursor('[', '](url)', '链接文字') },
    { icon: <Image size={15} />, title: '图片', action: () => insertAtCursor('![', '](url)', '描述') },
    { icon: <LockKeyhole size={15} />, title: '登录可见（选中文字后点击可包裹）', action: wrapMembersOnly },
  ];

  const displayPreviewHtml = useMemo(() => {
    if (!value.trim()) {
      return `<p class="article-preview-placeholder">${placeholder}</p>`;
    }
    return renderPostContentHtml(previewHtml, true);
  }, [value, previewHtml, placeholder]);

  const words = countWords(value);
  const showEdit = viewMode === 'edit' || viewMode === 'split';
  const showPreview = viewMode === 'preview' || viewMode === 'split';

  return (
    <div className="article-editor">
      <div className="article-editor-bar">
        <div className="article-editor-tools">
          {tools.map((t, i) => (
            <button
              key={i}
              type="button"
              className={`article-tool-btn${i === tools.length - 1 ? ' article-tool-btn--members' : ''}`}
              title={t.title}
              onMouseDown={e => e.preventDefault()}
              onClick={t.action}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div className="article-editor-modes">
          <button
            type="button"
            className={`article-mode-btn${viewMode === 'edit' ? ' active' : ''}`}
            onClick={() => setViewMode('edit')}
            title="仅编辑"
          >
            <Pencil size={14} /> 编辑
          </button>
          <button
            type="button"
            className={`article-mode-btn${viewMode === 'split' ? ' active' : ''}`}
            onClick={() => setViewMode('split')}
            title="分栏预览"
          >
            分栏
          </button>
          <button
            type="button"
            className={`article-mode-btn${viewMode === 'preview' ? ' active' : ''}`}
            onClick={() => setViewMode('preview')}
            title="仅预览"
          >
            <Eye size={14} /> 预览
          </button>
        </div>
      </div>

      <div className={`article-editor-panes article-editor-panes--${viewMode}`}>
        {showEdit && (
          <div className="article-pane article-pane--edit">
            <textarea
              ref={textareaRef}
              className="article-textarea"
              value={value}
              onChange={e => onChange(e.target.value)}
              onSelect={saveSelection}
              onKeyUp={saveSelection}
              onClick={saveSelection}
              onFocus={saveSelection}
              placeholder={placeholder}
              spellCheck={false}
            />
          </div>
        )}
        {showPreview && (
          <div className="article-pane article-pane--preview">
            {viewMode === 'split' && <div className="article-pane-label">实时预览</div>}
            <div
              className={`article-preview post-detail-content${!value.trim() ? ' article-preview--empty' : ''}`}
              dangerouslySetInnerHTML={{ __html: displayPreviewHtml }}
            />
          </div>
        )}
      </div>

      <div className="article-editor-status">
        <span>{words} 字</span>
        <span>Markdown</span>
      </div>
    </div>
  );
});

export default ArticleEditor;
