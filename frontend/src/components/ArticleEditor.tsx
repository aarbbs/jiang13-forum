import {
  useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useState, useMemo, type ReactNode,
} from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link as LinkIcon, Code, Quote,
  List, ListOrdered, Image as ImageIcon, Minus, LockKeyhole,
  FileCode, PenLine, Maximize2, Minimize2,
} from 'lucide-react';
import { POST_CONTENT_PURIFY_CONFIG } from '../utils/postContent';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdownContent';
import PostContent from './PostContent';
import { handleMarkdownTabKey, insertAtCursor } from '../utils/markdownIndent';
import {
  wrapMarkdownSelection,
  prefixMarkdownLines,
  cycleMarkdownHeading,
  insertMarkdownMembersOnly,
  insertMarkdownLink,
} from '../utils/markdownFormat';
import { countWords } from '../utils/text';
import { api } from '../api/client';
import { notify } from '@/lib/notify';
import { MembersOnly } from './editor/MembersOnlyExtension';
import { TabIndent } from './editor/TabIndentExtension';
import { ArticleLinkDialog } from './editor/ArticleLinkDialog';
import { Tooltip } from './ui/Tooltip';

export interface ArticleEditorHandle {
  getHTML: () => string;
  isEmpty: () => boolean;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

type EditorMode = 'rich' | 'markdown';
type LinkTarget = 'rich' | 'markdown';

interface ToolBtn {
  icon: ReactNode;
  title: string;
  hint?: string;
  align?: 'start' | 'center' | 'end';
  active?: boolean;
  className?: string;
  action: () => void;
}

const MEMBERS_ONLY_PLACEHOLDER = '在此输入仅登录用户可见的内容…';

/** 净化编辑器 HTML，保留 members-only 自定义标签 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG);
}

/** 判断编辑器内容是否为空 */
function isEditorEmpty(editor: Editor): boolean {
  return editor.state.doc.textContent.trim().length === 0;
}

/** 标题循环：正文 → H2 → H3 → … → H6 → 正文 */
function cycleHeading(editor: Editor) {
  for (let level = 2; level <= 6; level += 1) {
    if (editor.isActive('heading', { level })) {
      if (level === 6) {
        editor.chain().focus().setParagraph().run();
      } else {
        editor.chain().focus().toggleHeading({ level: (level + 1) as 2 | 3 | 4 | 5 | 6 }).run();
      }
      return;
    }
  }
  editor.chain().focus().toggleHeading({ level: 2 }).run();
}

/** 触发图片文件选择并上传 */
async function uploadPostImageFile(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const { url } = await api.uploadPostImage(file);
        resolve(url);
      } catch (e: unknown) {
        notify.error(e instanceof Error ? e.message : '图片上传失败');
        resolve(null);
      }
    };
    input.click();
  });
}

/** 渲染工具栏按钮列表 */
function renderToolButtons(tools: ToolBtn[]) {
  return tools.map((t, i) => (
    <span key={i} className={t.className === 'article-tool-btn--members' ? 'article-editor-tools-members' : undefined}>
      {t.className === 'article-tool-btn--members' ? (
        <span className="article-editor-tools-sep" aria-hidden="true" />
      ) : null}
      <Tooltip content={t.title} hint={t.hint} align={t.align} side="bottom">
        <button
          type="button"
          className={`article-tool-btn${t.active ? ' active' : ''}${t.className ? ` ${t.className}` : ''}`}
          onMouseDown={e => e.preventDefault()}
          onClick={t.action}
        >
          {t.icon}
        </button>
      </Tooltip>
    </span>
  ));
}

const ArticleEditor = forwardRef<ArticleEditorHandle, Props>(function ArticleEditor(
  { value, onChange, placeholder = '在此撰写正文…' },
  ref,
) {
  const isInternalUpdate = useRef(false);
  const lastValueRef = useRef(value);
  const [, setEditorTick] = useState(0);
  const [mode, setMode] = useState<EditorMode>('rich');
  const [fullscreen, setFullscreen] = useState(false);
  const [markdownSource, setMarkdownSource] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogUrl, setLinkDialogUrl] = useState('');
  const [linkTarget, setLinkTarget] = useState<LinkTarget>('rich');
  const markdownRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4, 5, 6] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'paragraph' && node.parent?.type.name === 'membersOnly') {
            return MEMBERS_ONLY_PLACEHOLDER;
          }
          return placeholder;
        },
        includeChildren: true,
      }),
      MembersOnly,
      TabIndent,
    ],
    content: sanitizeHtml(value) || '',
    onUpdate: ({ editor: ed }) => {
      const html = sanitizeHtml(ed.getHTML());
      isInternalUpdate.current = true;
      lastValueRef.current = html;
      onChange(html);

      // 清空后折叠选区，避免空文档残留全选高亮
      if (isEditorEmpty(ed) && !ed.state.selection.empty) {
        ed.commands.setTextSelection(1);
      }
    },
    onSelectionUpdate: () => {
      setEditorTick(t => t + 1);
    },
    onTransaction: () => {
      setEditorTick(t => t + 1);
    },
    editorProps: {
      attributes: {
        class: 'article-prosemirror post-detail-content',
        spellcheck: 'false',
      },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          if (!view.state.doc.textContent.trim()) {
            event.preventDefault();
            view.dispatch(view.state.tr.setSelection(
              TextSelection.create(view.state.doc, 1),
            ));
            return true;
          }
        }
        return false;
      },
    },
  });

  // 外部 value 变更时同步到编辑器（如加载已有帖子）
  useEffect(() => {
    if (!editor || mode !== 'rich') return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const next = sanitizeHtml(value);
    if (next === lastValueRef.current) return;
    lastValueRef.current = next;
    editor.commands.setContent(next || '', { emitUpdate: false });
  }, [value, editor, mode]);

  // 全屏时锁定页面滚动，Esc 退出
  useEffect(() => {
    if (!fullscreen) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreen]);

  useImperativeHandle(ref, () => ({
    getHTML: () => {
      if (mode === 'markdown') {
        return sanitizeHtml(markdownToHtml(markdownSource));
      }
      return editor ? sanitizeHtml(editor.getHTML()) : value;
    },
    isEmpty: () => {
      if (mode === 'markdown') {
        return markdownSource.trim().length === 0;
      }
      return editor ? isEditorEmpty(editor) : !value.trim();
    },
    focus: () => {
      if (mode === 'markdown') {
        markdownRef.current?.focus();
        return;
      }
      editor?.commands.focus();
    },
  }), [editor, value, mode, markdownSource]);

  const handleMarkdownChange = useCallback((next: string) => {
    setMarkdownSource(next);
    const html = sanitizeHtml(markdownToHtml(next));
    isInternalUpdate.current = true;
    lastValueRef.current = html;
    onChange(html);
  }, [onChange]);

  const openLinkDialog = useCallback((target: LinkTarget) => {
    if (target === 'rich') {
      if (!editor) return;
      const prev = editor.getAttributes('link').href as string | undefined;
      setLinkDialogUrl(prev ?? '');
    } else {
      setLinkDialogUrl('');
    }
    setLinkTarget(target);
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback((url: string) => {
    if (linkTarget === 'markdown') {
      const textarea = markdownRef.current;
      if (!textarea || !url) return;
      insertMarkdownLink(textarea, markdownSource, url, handleMarkdownChange);
      return;
    }
    if (!editor) return;
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor, linkTarget, markdownSource, handleMarkdownChange]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  }, [editor]);

  const setImage = useCallback(async () => {
    if (!editor) return;
    const url = await uploadPostImageFile();
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const wrapMembersOnly = useCallback(() => {
    if (!editor) return;

    if (editor.isActive('membersOnly')) {
      editor.chain().focus().exitMembersOnly().run();
      return;
    }

    const { from, to, empty } = editor.state.selection;
    if (!empty && from !== to) {
      editor.chain().focus().wrapMembersOnly().run();
      return;
    }
    editor.chain().focus().insertMembersOnly().run();
  }, [editor]);

  const switchToMarkdown = useCallback(() => {
    if (!editor) return;
    const html = sanitizeHtml(editor.getHTML());
    lastValueRef.current = html;
    setMarkdownSource(htmlToMarkdown(html));
    setMode('markdown');
  }, [editor]);

  const switchToRich = useCallback(() => {
    const html = sanitizeHtml(markdownToHtml(markdownSource));
    lastValueRef.current = html;
    isInternalUpdate.current = true;
    onChange(html);
    if (editor) {
      editor.commands.setContent(html || '', { emitUpdate: false });
    }
    setMode('rich');
  }, [editor, markdownSource, onChange]);

  const withMarkdown = useCallback((fn: (
    textarea: HTMLTextAreaElement,
    value: string,
    onChange: (v: string) => void,
  ) => void) => () => {
    const textarea = markdownRef.current;
    if (!textarea) return;
    fn(textarea, markdownSource, handleMarkdownChange);
  }, [markdownSource, handleMarkdownChange]);

  const insertMarkdownImage = useCallback(async () => {
    const textarea = markdownRef.current;
    if (!textarea) return;
    const url = await uploadPostImageFile();
    if (!url) return;
    insertAtCursor(textarea, markdownSource, `\n\n![图片](${url})\n\n`, handleMarkdownChange);
  }, [markdownSource, handleMarkdownChange]);

  const markdownPreviewHtml = useMemo(
    () => sanitizeHtml(markdownToHtml(markdownSource)),
    [markdownSource],
  );

  const buildRichTools = useCallback((): ToolBtn[] => {
    if (!editor) return [];
    return [
      { icon: <strong>H</strong>, title: '标题', hint: 'H2 → H6 循环', active: editor.isActive('heading'), action: () => cycleHeading(editor) },
      { icon: <Bold size={15} />, title: '加粗', active: editor.isActive('bold'), action: () => editor.chain().focus().toggleBold().run() },
      { icon: <Italic size={15} />, title: '斜体', active: editor.isActive('italic'), action: () => editor.chain().focus().toggleItalic().run() },
      { icon: <UnderlineIcon size={15} />, title: '下划线', active: editor.isActive('underline'), action: () => editor.chain().focus().toggleUnderline().run() },
      { icon: <Strikethrough size={15} />, title: '删除线', active: editor.isActive('strike'), action: () => editor.chain().focus().toggleStrike().run() },
      { icon: <Minus size={15} />, title: '分割线', action: () => editor.chain().focus().setHorizontalRule().run() },
      { icon: <Quote size={15} />, title: '引用', active: editor.isActive('blockquote'), action: () => editor.chain().focus().toggleBlockquote().run() },
      { icon: <List size={15} />, title: '无序列表', active: editor.isActive('bulletList'), action: () => editor.chain().focus().toggleBulletList().run() },
      { icon: <ListOrdered size={15} />, title: '有序列表', active: editor.isActive('orderedList'), action: () => editor.chain().focus().toggleOrderedList().run() },
      { icon: <Code size={15} />, title: '代码块', active: editor.isActive('codeBlock'), action: () => editor.chain().focus().toggleCodeBlock().run() },
      { icon: <LinkIcon size={15} />, title: '链接', active: editor.isActive('link'), action: () => openLinkDialog('rich') },
      { icon: <ImageIcon size={15} />, title: '上传图片', action: setImage },
      {
        icon: <LockKeyhole size={15} />,
        title: '登录可见',
        hint: '插入或包裹；区块内 Ctrl+Enter 退出',
        active: editor.isActive('membersOnly'),
        className: 'article-tool-btn--members',
        action: wrapMembersOnly,
      },
    ];
  }, [editor, openLinkDialog, setImage, wrapMembersOnly]);

  const buildMarkdownTools = useCallback((): ToolBtn[] => [
    { icon: <strong>H</strong>, title: '标题', hint: 'H2 → H6 循环', action: withMarkdown(cycleMarkdownHeading) },
    { icon: <Bold size={15} />, title: '加粗', action: withMarkdown((ta, v, ch) => wrapMarkdownSelection(ta, v, '**', '**', '加粗文字', ch)) },
    { icon: <Italic size={15} />, title: '斜体', action: withMarkdown((ta, v, ch) => wrapMarkdownSelection(ta, v, '*', '*', '斜体文字', ch)) },
    { icon: <UnderlineIcon size={15} />, title: '下划线', action: withMarkdown((ta, v, ch) => wrapMarkdownSelection(ta, v, '<u>', '</u>', '下划线文字', ch)) },
    { icon: <Strikethrough size={15} />, title: '删除线', action: withMarkdown((ta, v, ch) => wrapMarkdownSelection(ta, v, '~~', '~~', '删除线文字', ch)) },
    { icon: <Minus size={15} />, title: '分割线', action: withMarkdown((ta, v, ch) => insertAtCursor(ta, v, '\n\n---\n\n', ch)) },
    { icon: <Quote size={15} />, title: '引用', action: withMarkdown((ta, v, ch) => prefixMarkdownLines(ta, v, '> ', ch)) },
    { icon: <List size={15} />, title: '无序列表', action: withMarkdown((ta, v, ch) => prefixMarkdownLines(ta, v, '- ', ch)) },
    { icon: <ListOrdered size={15} />, title: '有序列表', action: withMarkdown((ta, v, ch) => prefixMarkdownLines(ta, v, '1. ', ch)) },
    { icon: <Code size={15} />, title: '代码块', action: withMarkdown((ta, v, ch) => wrapMarkdownSelection(ta, v, '```\n', '\n```', '代码', ch)) },
    { icon: <LinkIcon size={15} />, title: '链接', action: () => openLinkDialog('markdown') },
    { icon: <ImageIcon size={15} />, title: '上传图片', action: insertMarkdownImage },
    {
      icon: <LockKeyhole size={15} />,
      title: '登录可见',
      hint: '插入 <members-only> 区块',
      className: 'article-tool-btn--members',
      action: withMarkdown(insertMarkdownMembersOnly),
    },
  ], [withMarkdown, openLinkDialog, insertMarkdownImage]);

  const tools = mode === 'rich' ? buildRichTools() : buildMarkdownTools();
  const words = mode === 'markdown'
    ? countWords(markdownSource)
    : (editor ? countWords(editor.getText()) : 0);

  return (
    <div className={`article-editor article-editor--${mode}${fullscreen ? ' article-editor--fullscreen' : ''}`}>
      <div className="article-editor-bar">
        <div className="article-editor-tools">
          {renderToolButtons(tools)}
        </div>
      </div>

      <div className="article-editor-body">
        {mode === 'rich' ? (
          <div className="article-editor-pane article-editor-pane--rich">
            <div className="article-editor-scroll">
              <EditorContent editor={editor} className="article-editor-content" />
            </div>
          </div>
        ) : (
          <div className="article-editor-markdown">
            <div className="article-editor-pane article-editor-pane--source">
              <div className="article-editor-scroll">
                <textarea
                  ref={markdownRef}
                  className="article-editor-markdown-input"
                  value={markdownSource}
                  onChange={e => handleMarkdownChange(e.target.value)}
                  onKeyDown={e => handleMarkdownTabKey(e, handleMarkdownChange)}
                  placeholder="在此编写 Markdown 源码…"
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="article-editor-markdown-preview">
              <div className="article-editor-markdown-preview-label">预览</div>
              <PostContent
                html={markdownPreviewHtml}
                isLoggedIn
                className="article-editor-markdown-preview-body post-detail-content"
              />
            </div>
          </div>
        )}
      </div>

      <div className="article-editor-status">
        <div className="article-editor-status-meta">
          <span>{words} 字</span>
          <span className="article-editor-status-sep">·</span>
          <span>
            {mode === 'rich' ? '富文本' : 'Markdown 源码'}
            {' · Tab 缩进 / Shift+Tab 回退'}
            {mode === 'rich' ? ' · 登录可见内 Ctrl+Enter 退出' : ''}
          </span>
        </div>

        <div className="article-editor-status-actions">
          <Tooltip
            content={mode === 'rich' ? 'Markdown 源码' : '富文本编辑'}
            hint={mode === 'rich' ? '切换为 Markdown 源码编写' : '返回所见即所得编辑'}
            align="end"
            side="top"
          >
            <button
              type="button"
              className={`article-editor-view-btn${mode === 'markdown' ? ' active' : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={mode === 'rich' ? switchToMarkdown : switchToRich}
            >
              {mode === 'rich' ? <FileCode size={15} /> : <PenLine size={15} />}
              <span>{mode === 'rich' ? '源码' : '富文本'}</span>
            </button>
          </Tooltip>

          <Tooltip
            content={fullscreen ? '退出全屏' : '全屏编辑'}
            hint={fullscreen ? 'Esc 也可退出' : '沉浸式编写长文'}
            align="end"
            side="top"
          >
            <button
              type="button"
              className="article-editor-view-btn"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setFullscreen(v => !v)}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{fullscreen ? '退出全屏' : '全屏'}</span>
            </button>
          </Tooltip>
        </div>
      </div>

      <ArticleLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        initialUrl={linkDialogUrl}
        onConfirm={applyLink}
        onRemove={linkTarget === 'rich' && linkDialogUrl ? removeLink : undefined}
      />
    </div>
  );
});

export default ArticleEditor;
