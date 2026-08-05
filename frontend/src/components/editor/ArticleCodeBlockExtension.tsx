import CodeBlock from '@tiptap/extension-code-block';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { createCodeBlockHighlightPlugin } from '../../utils/codeBlockHighlightPlugin';
import { notify } from '@/lib/notify';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    articleCodeBlock: {
      /** 按选项插入或更新代码块 */
      setArticleCodeBlock: (attrs: {
        language?: string | null;
        lineNumbers?: boolean;
        collapsed?: boolean;
      }) => ReturnType;
    };
  }
}

function formatLangLabel(language: string): string {
  if (language === 'aardio') return 'aardio';
  return language || 'code';
}

/** 同步编辑态外壳：主题壳 + 语言 + 选项角标（外观随站点主题，不手选风格） */
function applyEditorChrome(ctx: {
  wrap: HTMLElement;
  langEl: HTMLElement;
  metaEl: HTMLElement;
  pre: HTMLElement;
  code: HTMLElement;
  node: ProseMirrorNode;
}) {
  const { wrap, langEl, metaEl, pre, code, node } = ctx;
  const lineNumbers = Boolean(node.attrs.lineNumbers);
  const collapsed = Boolean(node.attrs.collapsed);
  const language = ((node.attrs.language as string) || '').trim();

  wrap.className = 'md-codeblock md-codeblock--editor';
  wrap.removeAttribute('data-code-style');
  if (lineNumbers) wrap.setAttribute('data-line-numbers', 'true');
  else wrap.removeAttribute('data-line-numbers');
  if (collapsed) wrap.setAttribute('data-collapsed', 'true');
  else wrap.removeAttribute('data-collapsed');
  wrap.setAttribute('data-lang', formatLangLabel(language));

  langEl.textContent = formatLangLabel(language);

  const badges: string[] = [];
  if (lineNumbers) badges.push('行号');
  if (collapsed) badges.push('默认折叠');
  metaEl.textContent = badges.join(' · ');
  metaEl.hidden = badges.length === 0;

  pre.className = 'md-codeblock__pre';
  code.className = [
    'hljs',
    language ? `language-${language}` : '',
  ].filter(Boolean).join(' ');
}

/**
 * 文章代码块：行号 / 折叠属性 + 编辑壳 + hljs 着色。
 * 外观跟站点亮/暗主题；行号列与折叠裁切仅在阅读态渲染。
 */
export const ArticleCodeBlock = CodeBlock.extend({
  name: 'codeBlock',

  addAttributes() {
    return {
      ...this.parent?.(),
      lineNumbers: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-line-numbers') === 'true',
        renderHTML: (attrs) => {
          if (!attrs.lineNumbers) return {};
          return { 'data-line-numbers': 'true' };
        },
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs) => {
          if (!attrs.collapsed) return {};
          return { 'data-collapsed': 'true' };
        },
      },
    };
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let node = initialNode;
      const wrap = document.createElement('div');
      const head = document.createElement('div');
      head.className = 'md-codeblock__head';
      head.contentEditable = 'false';

      const langEl = document.createElement('span');
      langEl.className = 'md-codeblock__lang';

      const metaEl = document.createElement('span');
      metaEl.className = 'md-codeblock__editor-meta';

      const actions = document.createElement('span');
      actions.className = 'md-codeblock__actions';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'md-codeblock__copy';
      copyBtn.textContent = '复制';

      actions.append(metaEl, copyBtn);
      head.append(langEl, actions);

      const pre = document.createElement('pre');
      const code = document.createElement('code');
      pre.appendChild(code);
      wrap.append(head, pre);

      const sync = (n: ProseMirrorNode) => {
        applyEditorChrome({ wrap, langEl, metaEl, pre, code, node: n });
      };

      copyBtn.addEventListener('mousedown', e => e.preventDefault());
      copyBtn.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();
        const pos = typeof getPos === 'function' ? getPos() : null;
        const current = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null;
        const text = current?.textContent ?? code.textContent ?? '';
        try {
          await navigator.clipboard.writeText(text);
          const prev = copyBtn.textContent;
          copyBtn.textContent = '已复制';
          copyBtn.classList.add('is-copied');
          window.setTimeout(() => {
            copyBtn.textContent = prev || '复制';
            copyBtn.classList.remove('is-copied');
          }, 1600);
        } catch {
          notify.error('复制失败');
        }
      });

      sync(node);

      return {
        dom: wrap,
        contentDOM: code,
        update: (updated) => {
          if (updated.type.name !== 'codeBlock') return false;
          node = updated;
          sync(updated);
          return true;
        },
      };
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || [];
    return [
      ...parentPlugins,
      createCodeBlockHighlightPlugin(),
      // 代码块内粘贴：强制纯文本，保留换行（避免 HTML 分块把换行吃掉）
      new Plugin({
        key: new PluginKey('articleCodeBlockPaste'),
        props: {
          handlePaste: (view, event) => {
            const { state } = view;
            if (state.selection.$from.parent.type.name !== this.name) {
              return false;
            }
            const text = event.clipboardData?.getData('text/plain');
            if (text == null) return false;
            event.preventDefault();
            const normalized = text.replace(/\r\n?/g, '\n');
            const tr = state.tr;
            if (!state.selection.empty) {
              tr.deleteSelection();
            }
            tr.insertText(normalized);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setArticleCodeBlock: (attrs) => ({ commands, editor }) => {
        const next = {
          language: attrs.language || null,
          lineNumbers: Boolean(attrs.lineNumbers),
          collapsed: Boolean(attrs.collapsed),
        };
        if (editor.isActive(this.name)) {
          return commands.updateAttributes(this.name, next);
        }
        return commands.setNode(this.name, next);
      },
    };
  },
});
