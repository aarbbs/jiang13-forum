import {
  useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useState,
} from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Quote,
  List, ListOrdered, Code, Link as LinkIcon, Image as ImageIcon,
} from 'lucide-react';
import { POST_CONTENT_PURIFY_CONFIG } from '../utils/postContent';
import { api } from '../api/client';
import { notify } from '@/lib/notify';
import { ArticleCodeBlock } from './editor/ArticleCodeBlockExtension';
import { ArticleCodeBlockDialog } from './editor/ArticleCodeBlockDialog';
import { ArticleImage } from './editor/ArticleImageExtension';
import { TabIndent } from './editor/TabIndentExtension';
import type { CodeBlockInsertOptions } from '../utils/codeBlockOptions';
import { Tooltip } from './ui/Tooltip';
import StickerPicker from './emoji/StickerPicker';
import type { Sticker } from '../data/stickers';

export interface CommentEditorHandle {
  getHTML: () => string;
  isEmpty: () => boolean;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG);
}

function isEditorEmpty(editor: Editor): boolean {
  if (editor.state.doc.textContent.trim().length > 0) return false;
  // 检查是否有图片节点（表情）
  let hasImage = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') { hasImage = true; return false; }
  });
  return !hasImage;
}

/** 触发图片文件选择并上传 */
async function uploadImageFiles(): Promise<string[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.multiple = false;
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      if (!files.length) { resolve([]); return; }
      try {
        const { url } = await api.uploadPostImage(files[0]);
        resolve([url]);
      } catch (e: unknown) {
        notify.error(e instanceof Error ? e.message : '图片上传失败');
        resolve([]);
      }
    };
    input.click();
  });
}

const CommentEditor = forwardRef<CommentEditorHandle, Props>(function CommentEditor(
  { value, onChange, placeholder = '说点什么吧…' },
  ref,
) {
  const isInternalUpdate = useRef(false);
  const lastValueRef = useRef(value);
  const [, setTick] = useState(0);
  const [showSticker, setShowSticker] = useState(false);
  const [codeBlockDialogOpen, setCodeBlockDialogOpen] = useState(false);
  const [codeBlockEditing, setCodeBlockEditing] = useState(false);
  const [codeBlockInitial, setCodeBlockInitial] = useState<CodeBlockInsertOptions | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickerBtnRef = useRef<HTMLButtonElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        link: false,
        underline: false,
      }),
      ArticleCodeBlock,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      ArticleImage.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder }),
      TabIndent,
    ],
    content: sanitizeHtml(value) || '',
    autofocus: false,
    onUpdate: ({ editor: ed }) => {
      const html = sanitizeHtml(ed.getHTML());
      isInternalUpdate.current = true;
      lastValueRef.current = html;
      onChange(html);
    },
    onSelectionUpdate: () => setTick(t => t + 1),
    onTransaction: () => setTick(t => t + 1),
    editorProps: {
      attributes: {
        class: 'article-prosemirror post-detail-content',
        spellcheck: 'false',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const next = sanitizeHtml(value);
    if (next === lastValueRef.current) return;
    lastValueRef.current = next;
    editor.commands.setContent(next || '', { emitUpdate: false });
  }, [value, editor]);

  // 点击外部关闭贴纸面板
  useEffect(() => {
    if (!showSticker) return;
    const onPointer = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowSticker(false);
        stickerBtnRef.current?.focus();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSticker(false);
        stickerBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showSticker]);

  useImperativeHandle(ref, () => ({
    getHTML: () => editor ? sanitizeHtml(editor.getHTML()) : value,
    isEmpty: () => editor ? isEditorEmpty(editor) : !value.trim(),
    focus: () => { editor?.commands.focus(); },
  }), [editor, value]);

  const insertSticker = useCallback((sticker: Sticker) => {
    if (!editor) return;
    if (sticker.type === 'text' && sticker.text) {
      editor.chain().focus().insertContent(sticker.text).run();
    } else if (sticker.url) {
      // 插入内联图片 + 尾随空格，确保光标可定位到图片右侧（类似聊天 app）
      editor.chain().focus().insertContent([
        { type: 'image', attrs: { src: sticker.url, alt: sticker.name } },
        { type: 'text', text: ' ' },
      ]).run();
      // 再次 focus 确保光标在空格之后
      editor.chain().focus().run();
    }
    setShowSticker(false);
  }, [editor]);

  const setImage = useCallback(async () => {
    if (!editor) return;
    const urls = await uploadImageFiles();
    if (!urls.length) return;
    editor.chain().focus().setImage({ src: urls[0] }).run();
  }, [editor]);

  const openCodeBlockDialog = useCallback(() => {
    if (!editor) return;
    const isEditing = editor.isActive('codeBlock');
    setCodeBlockEditing(isEditing);
    if (isEditing) {
      const attrs = editor.getAttributes('codeBlock');
      setCodeBlockInitial({
        language: (attrs.language as string) || '',
        lineNumbers: Boolean(attrs.lineNumbers),
        collapsed: Boolean(attrs.collapsed),
      });
    } else {
      // 新建代码块默认折叠（评论空间有限）
      setCodeBlockInitial({ language: '', lineNumbers: false, collapsed: true });
    }
    setCodeBlockDialogOpen(true);
  }, [editor]);

  const applyCodeBlock = useCallback((opts: CodeBlockInsertOptions) => {
    if (!editor) return;
    editor.chain().focus().setArticleCodeBlock({
      language: opts.language || null,
      lineNumbers: opts.lineNumbers,
      collapsed: opts.collapsed,
    }).run();
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('链接地址', prev ?? 'https://');
    if (url === null) return;
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return <div className="comment-editor"><div className="article-editor-bar" /><div className="article-editor-body" /></div>;
  }

  const tools: { icon: React.ReactNode; title: string; active?: boolean; action: () => void }[] = [
    { icon: <strong>H</strong>, title: '标题', active: editor.isActive('heading'), action: () => {
      for (let l = 2; l <= 4; l++) {
        if (editor.isActive('heading', { level: l })) {
          if (l === 4) editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: (l + 1) as 2 | 3 | 4 }).run();
          return;
        }
      }
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    }},
    { icon: <Bold size={15} />, title: '加粗', active: editor.isActive('bold'), action: () => editor.chain().focus().toggleBold().run() },
    { icon: <Italic size={15} />, title: '斜体', active: editor.isActive('italic'), action: () => editor.chain().focus().toggleItalic().run() },
    { icon: <UnderlineIcon size={15} />, title: '下划线', active: editor.isActive('underline'), action: () => editor.chain().focus().toggleUnderline().run() },
    { icon: <Strikethrough size={15} />, title: '删除线', active: editor.isActive('strike'), action: () => editor.chain().focus().toggleStrike().run() },
    { icon: <Quote size={15} />, title: '引用', active: editor.isActive('blockquote'), action: () => editor.chain().focus().toggleBlockquote().run() },
    { icon: <List size={15} />, title: '无序列表', active: editor.isActive('bulletList'), action: () => editor.chain().focus().toggleBulletList().run() },
    { icon: <ListOrdered size={15} />, title: '有序列表', active: editor.isActive('orderedList'), action: () => editor.chain().focus().toggleOrderedList().run() },
    { icon: <Code size={15} />, title: '代码块', active: editor.isActive('codeBlock'), action: openCodeBlockDialog },
    { icon: <LinkIcon size={15} />, title: '链接', active: editor.isActive('link'), action: setLink },
    { icon: <ImageIcon size={15} />, title: '上传图片', action: setImage },
    { icon: <span className="article-tool-btn__owo">OwO</span>, title: '表情 OwO', active: showSticker, action: () => setShowSticker(v => !v) },
  ];

  return (
    <div className="comment-editor" ref={boxRef}>
      <div className="article-editor-bar">
        <div className="article-editor-tools">
          {tools.map((t, i) => (
            <Tooltip key={i} content={t.title} side="bottom">
              <button
                ref={i === tools.length - 1 ? stickerBtnRef : undefined}
                type="button"
                className={`article-tool-btn${t.active ? ' active' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onClick={t.action}
                aria-label={t.title}
              >
                {t.icon}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="article-editor-body">
        <div className="article-editor-scroll">
          <EditorContent editor={editor} className="article-editor-content" />
        </div>
      </div>
      {showSticker && <StickerPicker onSelect={insertSticker} />}
      <ArticleCodeBlockDialog
        open={codeBlockDialogOpen}
        onOpenChange={setCodeBlockDialogOpen}
        initial={codeBlockInitial}
        editing={codeBlockEditing}
        onConfirm={applyCodeBlock}
      />
    </div>
  );
});

export default CommentEditor;
