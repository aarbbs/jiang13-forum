import {
  useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useState, type ReactNode,
} from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import DOMPurify from 'dompurify';
import {
  Bold, Italic, Strikethrough, Link as LinkIcon, Code, Quote,
  List, ListOrdered, Image as ImageIcon, Minus, LockKeyhole,
} from 'lucide-react';
import { POST_CONTENT_PURIFY_CONFIG } from '../utils/postContent';
import { countWords } from '../utils/text';
import { api } from '../api/client';
import { notify } from '@/lib/notify';
import { MembersOnly } from './editor/MembersOnlyExtension';

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

interface ToolBtn {
  icon: ReactNode;
  title: string;
  active?: boolean;
  className?: string;
  action: () => void;
}

/** 净化编辑器 HTML，保留 members-only 自定义标签 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG);
}

/** 判断编辑器内容是否为空 */
function isEditorEmpty(editor: Editor): boolean {
  return editor.state.doc.textContent.trim().length === 0;
}

/** 标题循环：无标题 → H2 → H3 → … → H6 → 正文 */
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

const ArticleEditor = forwardRef<ArticleEditorHandle, Props>(function ArticleEditor(
  { value, onChange, placeholder = '在此撰写正文…' },
  ref,
) {
  const isInternalUpdate = useRef(false);
  const lastValueRef = useRef(value);
  const [, setEditorTick] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
      MembersOnly,
    ],
    content: sanitizeHtml(value) || '',
    onUpdate: ({ editor: ed }) => {
      const html = sanitizeHtml(ed.getHTML());
      isInternalUpdate.current = true;
      lastValueRef.current = html;
      onChange(html);
    },
    onSelectionUpdate: () => setEditorTick(t => t + 1),
    onTransaction: () => setEditorTick(t => t + 1),
    editorProps: {
      attributes: {
        class: 'article-prosemirror post-detail-content',
        spellcheck: 'false',
      },
    },
  });

  // 外部 value 变更时同步到编辑器（如加载已有帖子）
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

  useImperativeHandle(ref, () => ({
    getHTML: () => (editor ? sanitizeHtml(editor.getHTML()) : value),
    isEmpty: () => (editor ? isEditorEmpty(editor) : !value.trim()),
    focus: () => editor?.commands.focus(),
  }), [editor, value]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('链接地址', prev ?? 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }, [editor]);

  const setImage = useCallback(() => {
    if (!editor) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const { url } = await api.uploadPostImage(file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch (e: unknown) {
        notify.error(e instanceof Error ? e.message : '图片上传失败');
      }
    };
    input.click();
  }, [editor]);

  const wrapMembersOnly = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (!empty && from !== to) {
      editor.chain().focus().wrapMembersOnly().run();
      return;
    }
    editor.chain().focus().insertMembersOnly().run();
  }, [editor]);

  const buildTools = useCallback((): ToolBtn[] => {
    if (!editor) return [];
    return [
      {
        icon: <strong>H</strong>,
        title: '标题（H2，再次点击升级）',
        active: editor.isActive('heading'),
        action: () => cycleHeading(editor),
      },
      {
        icon: <Bold size={15} />,
        title: '加粗',
        active: editor.isActive('bold'),
        action: () => editor.chain().focus().toggleBold().run(),
      },
      {
        icon: <Italic size={15} />,
        title: '斜体',
        active: editor.isActive('italic'),
        action: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        icon: <Strikethrough size={15} />,
        title: '删除线',
        active: editor.isActive('strike'),
        action: () => editor.chain().focus().toggleStrike().run(),
      },
      {
        icon: <Minus size={15} />,
        title: '分割线',
        action: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        icon: <Quote size={15} />,
        title: '引用',
        active: editor.isActive('blockquote'),
        action: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        icon: <List size={15} />,
        title: '无序列表',
        active: editor.isActive('bulletList'),
        action: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        icon: <ListOrdered size={15} />,
        title: '有序列表',
        active: editor.isActive('orderedList'),
        action: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        icon: <Code size={15} />,
        title: '代码块',
        active: editor.isActive('codeBlock'),
        action: () => editor.chain().focus().toggleCodeBlock().run(),
      },
      {
        icon: <LinkIcon size={15} />,
        title: '链接',
        active: editor.isActive('link'),
        action: setLink,
      },
      {
        icon: <ImageIcon size={15} />,
        title: '上传图片',
        action: setImage,
      },
      {
        icon: <LockKeyhole size={15} />,
        title: '登录可见（选中文字后点击可包裹）',
        active: editor.isActive('membersOnly'),
        className: 'article-tool-btn--members',
        action: wrapMembersOnly,
      },
    ];
  }, [editor, setLink, setImage, wrapMembersOnly]);

  const tools = buildTools();
  const words = editor ? countWords(editor.getText()) : 0;

  return (
    <div className="article-editor">
      <div className="article-editor-bar">
        <div className="article-editor-tools">
          {tools.map((t, i) => (
            <button
              key={i}
              type="button"
              className={`article-tool-btn${t.active ? ' active' : ''}${t.className ? ` ${t.className}` : ''}`}
              title={t.title}
              onMouseDown={e => e.preventDefault()}
              onClick={t.action}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="article-editor-body">
        <EditorContent editor={editor} className="article-editor-content" />
      </div>

      <div className="article-editor-status">
        <span>{words} 字</span>
        <span>富文本</span>
      </div>
    </div>
  );
});

export default ArticleEditor;
