import hljs from 'highlight.js/lib/common';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { registerAardioLanguage } from './hljsAardio';

registerAardioLanguage(hljs);

const key = new PluginKey('articleCodeBlockHighlight');

/** 将 hljs HTML 映射为 ProseMirror inline Decoration */
function decorationsForCodeBlock(node: ProseMirrorNode, pos: number): Decoration[] {
  const language = ((node.attrs.language as string) || '').trim();
  const text = node.textContent;
  if (!text || !language || !hljs.getLanguage(language)) return [];

  let html: string;
  try {
    html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  } catch {
    return [];
  }

  const root = document.createElement('div');
  root.innerHTML = html;
  const out: Decoration[] = [];
  let offset = 0;

  const walk = (dom: Node, className: string | null) => {
    if (dom.nodeType === Node.TEXT_NODE) {
      const len = dom.textContent?.length ?? 0;
      if (len > 0 && className) {
        const from = pos + 1 + offset;
        out.push(Decoration.inline(from, from + len, { class: className }));
      }
      offset += len;
      return;
    }
    if (dom.nodeType !== Node.ELEMENT_NODE) return;
    const el = dom as Element;
    const nextClass = el.className || className;
    el.childNodes.forEach(child => walk(child, nextClass));
  };

  root.childNodes.forEach(child => walk(child, null));
  return out;
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;
    decos.push(...decorationsForCodeBlock(node, pos));
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/** 富文本代码块：用 Decoration 叠 hljs 着色，保持可编辑纯文本 */
export function createCodeBlockHighlightPlugin(): Plugin {
  return new Plugin({
    key,
    state: {
      init: (_, state) => buildDecorations(state.doc),
      apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
    },
    props: {
      decorations: state => key.getState(state),
    },
  });
}
