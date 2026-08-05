import {
  useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useState, useMemo, type ReactNode,
} from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { TableKit } from '@tiptap/extension-table';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link as LinkIcon, Code, Quote,
  List, ListOrdered, Image as ImageIcon, Minus, LockKeyhole,
  FileCode, PenLine, Maximize2, Minimize2,
  Columns2, PanelLeft, PanelRight, StretchHorizontal,
  Table as TableIcon, BetweenHorizonalStart, BetweenVerticalStart, Rows3, Columns3,
  MessageSquareLock, Coins,
} from 'lucide-react';
import { POST_CONTENT_PURIFY_CONFIG } from '../utils/postContent';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdownContent';
import PostContent from './PostContent';
import { handleMarkdownTabKey, insertAtCursor, applyTextareaChange } from '../utils/markdownIndent';
import {
  wrapMarkdownSelection,
  prefixMarkdownLines,
  cycleMarkdownHeading,
  insertMarkdownMembersOnly,
  insertMarkdownReplyOnly,
  insertMarkdownLink,
} from '../utils/markdownFormat';
import { countWords } from '../utils/text';
import { api } from '../api/client';
import { notify } from '@/lib/notify';
import { MembersOnly } from './editor/MembersOnlyExtension';
import { ReplyOnly } from './editor/ReplyOnlyExtension';
import { PointsOnly } from './editor/PointsOnlyExtension';
import { TabIndent } from './editor/TabIndentExtension';
import { ArticleImage, type ImageDisplay } from './editor/ArticleImageExtension';
import { ImageGroup, suggestImageGroupLayout } from './editor/ImageGroupExtension';
import { ClearFloatParagraph, ClearFloatSync } from './editor/ClearFloatParagraph';
import { ArticleLinkDialog } from './editor/ArticleLinkDialog';
import { ArticleCodeBlockDialog } from './editor/ArticleCodeBlockDialog';
import { ArticleCodeBlock } from './editor/ArticleCodeBlockExtension';
import {
  ArticleTableDialog,
  type TableInsertOptions,
} from './editor/ArticleTableDialog';
import {
  formatFenceInfo,
  type CodeBlockInsertOptions,
} from '../utils/codeBlockOptions';
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
type CodeBlockTarget = 'rich' | 'markdown';
type TableTarget = 'rich' | 'markdown';

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
const REPLY_ONLY_PLACEHOLDER = '在此输入回复后可见的内容…';

/** 按选项生成 Markdown 侧插入片段（围栏 meta，便于手写） */
function buildMarkdownCodeBlockSnippet(opts: CodeBlockInsertOptions, body = '代码'): string {
  const info = formatFenceInfo(opts);
  const fence = info ? `\`\`\`${info}` : '```';
  return `\n${fence}\n${body}\n\`\`\`\n`;
}

/** 生成 GFM 管道表；源码侧始终带表头分隔行 */
function buildMarkdownTableSnippet(opts: TableInsertOptions): string {
  const cols = Math.max(1, opts.cols);
  const totalRows = Math.max(1, opts.rows);
  const bodyRows = Math.max(0, totalRows - 1);
  const headerCells = Array.from({ length: cols }, (_, i) => `列${i + 1}`);
  const sepCells = Array.from({ length: cols }, () => '---');
  const emptyCells = Array.from({ length: cols }, () => ' ');
  const lines = [
    `| ${headerCells.join(' | ')} |`,
    `| ${sepCells.join(' | ')} |`,
    ...Array.from({ length: bodyRows }, () => `| ${emptyCells.join(' | ')} |`),
  ];
  return `\n\n${lines.join('\n')}\n\n`;
}

/** 净化编辑器 HTML，保留 members-only 自定义标签 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG);
}

/** 判断编辑器内容是否为空 */
function isEditorEmpty(editor: Editor): boolean {
  return editor.state.doc.textContent.trim().length === 0;
}

/**
 * 将光标放到第一个文本块开头。
 * 文档以分割线等原子节点开头时，默认选区会变成 NodeSelection，出现整条高亮。
 */
function placeCaretInFirstTextblock(editor: Editor) {
  const { state } = editor;
  const { doc, selection } = state;
  let pos: number | null = null;
  doc.descendants((node, nodePos) => {
    if (node.isTextblock) {
      pos = nodePos + 1;
      return false;
    }
    return true;
  });
  if (pos == null) return;

  const needsMove =
    selection instanceof NodeSelection
    || selection.from !== pos
    || selection.to !== pos;
  if (!needsMove) return;

  const tr = state.tr
    .setSelection(TextSelection.create(doc, pos))
    .setMeta('addToHistory', false);
  editor.view.dispatch(tr);
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

/** 触发图片文件选择并上传（支持多选） */
async function uploadPostImageFiles(multiple = true): Promise<string[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.multiple = multiple;
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      if (!files.length) {
        resolve([]);
        return;
      }
      const urls: string[] = [];
      for (const file of files) {
        try {
          const { url } = await api.uploadPostImage(file);
          urls.push(url);
        } catch (e: unknown) {
          notify.error(e instanceof Error ? e.message : '图片上传失败');
        }
      }
      resolve(urls);
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
  const [codeBlockDialogOpen, setCodeBlockDialogOpen] = useState(false);
  const [codeBlockTarget, setCodeBlockTarget] = useState<CodeBlockTarget>('rich');
  const [codeBlockEditing, setCodeBlockEditing] = useState(false);
  const [codeBlockInitial, setCodeBlockInitial] = useState<Partial<CodeBlockInsertOptions> | null>(null);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [tableTarget, setTableTarget] = useState<TableTarget>('rich');
  const [tableEditing, setTableEditing] = useState(false);
  const markdownRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4, 5, 6] },
        paragraph: false,
        codeBlock: false,
        // StarterKit v3 已内置；下面单独配置，需先关掉避免重复
        link: false,
        underline: false,
      }),
      ArticleCodeBlock,
      TableKit.configure({
        table: {
          resizable: false,
          HTMLAttributes: { class: 'article-table' },
        },
      }),
      ClearFloatParagraph,
      ClearFloatSync,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      ArticleImage.configure({ inline: false, allowBase64: false }),
      ImageGroup,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'paragraph' && node.parent?.type.name === 'membersOnly') {
            return MEMBERS_ONLY_PLACEHOLDER;
          }
          if (node.type.name === 'paragraph' && node.parent?.type.name === 'replyOnly') {
            return REPLY_ONLY_PLACEHOLDER;
          }
          if (node.type.name === 'paragraph' && node.parent?.type.name === 'pointsOnly') {
            return '此处内容需积分解锁后可见…';
          }
          return placeholder;
        },
        includeChildren: true,
      }),
      MembersOnly,
      ReplyOnly,
      PointsOnly,
      TabIndent,
    ],
    content: sanitizeHtml(value) || '',
    autofocus: false,
    onCreate: ({ editor: ed }) => {
      placeCaretInFirstTextblock(ed);
    },
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
    // 加载长文时避免首行分割线被 NodeSelection 选中
    placeCaretInFirstTextblock(editor);
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
      if (!editor) return;
      placeCaretInFirstTextblock(editor);
      editor.commands.focus();
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

  const openCodeBlockDialog = useCallback((target: CodeBlockTarget) => {
    setCodeBlockTarget(target);
    if (target === 'rich' && editor?.isActive('codeBlock')) {
      const attrs = editor.getAttributes('codeBlock');
      setCodeBlockEditing(true);
      setCodeBlockInitial({
        language: (attrs.language as string) || '',
        lineNumbers: Boolean(attrs.lineNumbers),
        collapsed: Boolean(attrs.collapsed),
      });
    } else {
      setCodeBlockEditing(false);
      setCodeBlockInitial(null);
    }
    setCodeBlockDialogOpen(true);
  }, [editor]);

  const applyCodeBlock = useCallback((opts: CodeBlockInsertOptions) => {
    if (codeBlockTarget === 'markdown') {
      const textarea = markdownRef.current;
      if (!textarea) return;
      const { selectionStart, selectionEnd } = textarea;
      const selected = markdownSource.slice(selectionStart, selectionEnd);
      const body = selected || '代码';
      const snippet = buildMarkdownCodeBlockSnippet(opts, body);
      const next = markdownSource.slice(0, selectionStart) + snippet + markdownSource.slice(selectionEnd);
      const bodyOffset = snippet.indexOf(body);
      const newStart = bodyOffset >= 0 ? selectionStart + bodyOffset : selectionStart + snippet.length;
      const newEnd = bodyOffset >= 0 ? newStart + body.length : newStart;
      applyTextareaChange(textarea, next, newStart, newEnd, handleMarkdownChange);
      return;
    }
    if (!editor) return;
    editor.chain().focus().setArticleCodeBlock({
      language: opts.language || null,
      lineNumbers: opts.lineNumbers,
      collapsed: opts.collapsed,
    }).run();
  }, [codeBlockTarget, editor, markdownSource, handleMarkdownChange]);

  const removeCodeBlock = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('codeBlock')) {
      editor.chain().focus().toggleCodeBlock().run();
    }
  }, [editor]);

  const openTableDialog = useCallback((target: TableTarget) => {
    setTableTarget(target);
    setTableEditing(target === 'rich' && Boolean(editor?.isActive('table')));
    setTableDialogOpen(true);
  }, [editor]);

  const applyTable = useCallback((opts: TableInsertOptions) => {
    if (tableTarget === 'markdown') {
      const textarea = markdownRef.current;
      if (!textarea) return;
      insertAtCursor(textarea, markdownSource, buildMarkdownTableSnippet(opts), handleMarkdownChange);
      return;
    }
    if (!editor) return;
    editor.chain().focus().insertTable({
      rows: opts.rows,
      cols: opts.cols,
      withHeaderRow: opts.withHeaderRow,
    }).run();
  }, [tableTarget, editor, markdownSource, handleMarkdownChange]);

  const removeTable = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('table')) {
      editor.chain().focus().deleteTable().run();
    }
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
    const urls = await uploadPostImageFiles(true);
    if (!urls.length) return;
    if (urls.length === 1) {
      editor.chain().focus().setImage({ src: urls[0] }).run();
      return;
    }
    editor.chain().focus().insertImageGroup(urls, suggestImageGroupLayout(urls.length)).run();
  }, [editor]);

  const setImageDisplay = useCallback((display: ImageDisplay) => {
    if (!editor) return;
    editor.chain().focus().setImageDisplay(display).run();
  }, [editor]);

  const wrapSelectedAsGroup = useCallback(() => {
    if (!editor) return;
    if (!editor.commands.wrapImagesInGroup()) {
      notify.warning('请先点击或靠近至少两张连续图片，再合并为图组');
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

  const wrapReplyOnly = useCallback(() => {
    if (!editor) return;

    if (editor.isActive('replyOnly')) {
      editor.chain().focus().exitReplyOnly().run();
      return;
    }

    const { from, to, empty } = editor.state.selection;
    if (!empty && from !== to) {
      editor.chain().focus().wrapReplyOnly().run();
      return;
    }
    editor.chain().focus().insertReplyOnly().run();
  }, [editor]);

  const wrapPointsOnly = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('pointsOnly')) {
      editor.chain().focus().exitPointsOnly().run();
      return;
    }
    const { from, to, empty } = editor.state.selection;
    if (!empty && from !== to) {
      editor.chain().focus().wrapPointsOnly(10).run();
      return;
    }
    editor.chain().focus().insertPointsOnly(10).run();
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
      placeCaretInFirstTextblock(editor);
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
    const urls = await uploadPostImageFiles(true);
    if (!urls.length) return;
    if (urls.length === 1) {
      insertAtCursor(textarea, markdownSource, `\n\n![图片](${urls[0]})\n\n`, handleMarkdownChange);
      return;
    }
    const layout = suggestImageGroupLayout(urls.length);
    const imgs = urls.map(u => `<img src="${u}" alt="">`).join('');
    const block = `\n\n<div data-image-group data-layout="${layout}" class="image-group image-group--${layout}">${imgs}</div>\n\n`;
    insertAtCursor(textarea, markdownSource, block, handleMarkdownChange);
  }, [markdownSource, handleMarkdownChange]);

  const markdownPreviewHtml = useMemo(
    () => sanitizeHtml(markdownToHtml(markdownSource)),
    [markdownSource],
  );

  const buildRichTools = useCallback((): ToolBtn[] => {
    if (!editor) return [];
    const imageActive = editor.isActive('image');
    const groupActive = editor.isActive('imageGroup');
    const currentDisplay = (editor.getAttributes('image').display as ImageDisplay) || 'default';

    const tools: ToolBtn[] = [
      { icon: <strong>H</strong>, title: '标题', hint: 'H2 → H6 循环', active: editor.isActive('heading'), action: () => cycleHeading(editor) },
      { icon: <Bold size={15} />, title: '加粗', active: editor.isActive('bold'), action: () => editor.chain().focus().toggleBold().run() },
      { icon: <Italic size={15} />, title: '斜体', active: editor.isActive('italic'), action: () => editor.chain().focus().toggleItalic().run() },
      { icon: <UnderlineIcon size={15} />, title: '下划线', active: editor.isActive('underline'), action: () => editor.chain().focus().toggleUnderline().run() },
      { icon: <Strikethrough size={15} />, title: '删除线', active: editor.isActive('strike'), action: () => editor.chain().focus().toggleStrike().run() },
      { icon: <Minus size={15} />, title: '分割线', action: () => editor.chain().focus().setHorizontalRule().run() },
      { icon: <Quote size={15} />, title: '引用', active: editor.isActive('blockquote'), action: () => editor.chain().focus().toggleBlockquote().run() },
      { icon: <List size={15} />, title: '无序列表', active: editor.isActive('bulletList'), action: () => editor.chain().focus().toggleBulletList().run() },
      { icon: <ListOrdered size={15} />, title: '有序列表', active: editor.isActive('orderedList'), action: () => editor.chain().focus().toggleOrderedList().run() },
      { icon: <Code size={15} />, title: '代码块', hint: '语言、行号与折叠', active: editor.isActive('codeBlock'), action: () => openCodeBlockDialog('rich') },
      { icon: <TableIcon size={15} />, title: '表格', hint: '插入表格；表内可增删行列', active: editor.isActive('table'), action: () => openTableDialog('rich') },
      { icon: <LinkIcon size={15} />, title: '链接', active: editor.isActive('link'), action: () => openLinkDialog('rich') },
      {
        icon: <ImageIcon size={15} />,
        title: '上传图片',
        hint: '可多选；多张自动并排成图组',
        action: setImage,
      },
      {
        icon: <Columns2 size={15} />,
        title: '合并为图组',
        hint: '点击一张图后合并其附近连续图片（无需框选多张）',
        active: groupActive,
        action: wrapSelectedAsGroup,
      },
    ];

    if (editor.isActive('table')) {
      tools.push(
        {
          icon: <BetweenHorizonalStart size={15} />,
          title: '下方插入行',
          action: () => editor.chain().focus().addRowAfter().run(),
        },
        {
          icon: <BetweenVerticalStart size={15} />,
          title: '右侧插入列',
          action: () => editor.chain().focus().addColumnAfter().run(),
        },
        {
          icon: <Rows3 size={15} />,
          title: '删除行',
          hint: '删除当前行',
          action: () => editor.chain().focus().deleteRow().run(),
        },
        {
          icon: <Columns3 size={15} />,
          title: '删除列',
          hint: '删除当前列',
          action: () => editor.chain().focus().deleteColumn().run(),
        },
      );
    }

    if (imageActive && !groupActive) {
      tools.push(
        {
          icon: <StretchHorizontal size={15} />,
          title: '通栏大图',
          active: currentDisplay === 'wide',
          action: () => setImageDisplay(currentDisplay === 'wide' ? 'default' : 'wide'),
        },
        {
          icon: <PanelLeft size={15} />,
          title: '左绕排',
          hint: '图片居左，文字环绕',
          active: currentDisplay === 'float-left',
          action: () => setImageDisplay(currentDisplay === 'float-left' ? 'default' : 'float-left'),
        },
        {
          icon: <PanelRight size={15} />,
          title: '右绕排',
          hint: '图片居右，文字环绕',
          active: currentDisplay === 'float-right',
          action: () => setImageDisplay(currentDisplay === 'float-right' ? 'default' : 'float-right'),
        },
      );
    }

    tools.push(
      {
        icon: <LockKeyhole size={15} />,
        title: '登录可见',
        hint: '插入或包裹；区块内 Ctrl+Enter 退出',
        active: editor.isActive('membersOnly'),
        className: 'article-tool-btn--members',
        action: wrapMembersOnly,
      },
      {
        icon: <MessageSquareLock size={15} />,
        title: '回复可见',
        hint: '读者回复后才可见；区块内 Ctrl+Enter 退出',
        active: editor.isActive('replyOnly'),
        className: 'article-tool-btn--reply',
        action: wrapReplyOnly,
      },
      {
        icon: <Coins size={15} />,
        title: '积分可见',
        hint: '读者花费积分解锁；可设价格',
        active: editor.isActive('pointsOnly'),
        className: 'article-tool-btn--points',
        action: wrapPointsOnly,
      },
    );

    return tools;
  }, [editor, openLinkDialog, openCodeBlockDialog, openTableDialog, setImage, wrapMembersOnly, wrapReplyOnly, wrapPointsOnly, wrapSelectedAsGroup, setImageDisplay]);

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
    { icon: <Code size={15} />, title: '代码块', hint: '语言、行号与折叠', action: () => openCodeBlockDialog('markdown') },
    { icon: <TableIcon size={15} />, title: '表格', hint: '插入 GFM 管道表', action: () => openTableDialog('markdown') },
    { icon: <LinkIcon size={15} />, title: '链接', action: () => openLinkDialog('markdown') },
    { icon: <ImageIcon size={15} />, title: '上传图片', action: insertMarkdownImage },
    {
      icon: <LockKeyhole size={15} />,
      title: '登录可见',
      hint: '插入 <members-only> 区块',
      className: 'article-tool-btn--members',
      action: withMarkdown(insertMarkdownMembersOnly),
    },
    {
      icon: <MessageSquareLock size={15} />,
      title: '回复可见',
      hint: '插入 <reply-only> 区块',
      className: 'article-tool-btn--reply',
      action: withMarkdown(insertMarkdownReplyOnly),
    },
  ], [withMarkdown, openLinkDialog, openCodeBlockDialog, openTableDialog, insertMarkdownImage]);

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
          <span className="article-editor-wordcount">{words} 字</span>
          <span className="article-editor-status-sep" aria-hidden>·</span>
          <span className="article-editor-mode-label">
            {mode === 'rich' ? '所见即所得' : 'Markdown'}
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
              className={`article-editor-view-btn${fullscreen ? ' active' : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => setFullscreen(v => !v)}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{fullscreen ? '退出' : '全屏'}</span>
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
      <ArticleCodeBlockDialog
        open={codeBlockDialogOpen}
        onOpenChange={setCodeBlockDialogOpen}
        initial={codeBlockInitial}
        editing={codeBlockEditing}
        onConfirm={applyCodeBlock}
        onRemove={codeBlockEditing ? removeCodeBlock : undefined}
      />
      <ArticleTableDialog
        open={tableDialogOpen}
        onOpenChange={setTableDialogOpen}
        editing={tableEditing}
        onConfirm={applyTable}
        onRemove={tableEditing ? removeTable : undefined}
      />
    </div>
  );
});

export default ArticleEditor;
