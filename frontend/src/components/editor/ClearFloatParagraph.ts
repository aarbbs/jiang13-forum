import Paragraph from '@tiptap/extension-paragraph';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode, NodeType } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';

function isFloatImage(node: ProseMirrorNode): boolean {
  if (node.type.name !== 'image') return false;
  const display = node.attrs.display as string | undefined;
  return display === 'float-left' || display === 'float-right';
}

function isBlankParagraph(node: ProseMirrorNode): boolean {
  if (node.type.name !== 'paragraph') return false;
  if (node.content.size === 0) return true;
  let blank = true;
  node.forEach(child => {
    if (child.type.name === 'hardBreak') return;
    if (child.isText && !(child.text || '').replace(/\u00a0/g, ' ').trim()) return;
    blank = false;
  });
  return blank;
}

function isHardClearBlock(node: ProseMirrorNode): boolean {
  const name = node.type.name;
  if (name === 'image') return !isFloatImage(node);
  return name === 'imageGroup'
    || name === 'heading'
    || name === 'horizontalRule'
    || name === 'codeBlock'
    || name === 'blockquote'
    || name === 'table'
    || name === 'bulletList'
    || name === 'orderedList';
}

/**
 * 计算顶层块是否应带 clearFloat。
 * - 双空行后自动打开
 * - 一旦打开，只要仍在绕排图之后就保持（避免源码往返丢空段后失效）
 */
function computeClearFloatFlags(doc: ProseMirrorNode): boolean[] {
  const flags: boolean[] = [];
  let seenFloat = false;
  let blankRun = 0;

  doc.forEach(node => {
    if (isFloatImage(node)) {
      seenFloat = true;
      blankRun = 0;
      flags.push(false);
      return;
    }

    if (isHardClearBlock(node)) {
      seenFloat = false;
      blankRun = 0;
      flags.push(false);
      return;
    }

    if (!seenFloat) {
      flags.push(false);
      blankRun = 0;
      return;
    }

    if (isBlankParagraph(node)) {
      blankRun += 1;
      flags.push(false);
      return;
    }

    const already = Boolean(node.attrs.clearFloat);
    flags.push(blankRun >= 2 || already);
    blankRun = 0;
  });

  return flags;
}

function syncClearFloatAttrs(doc: ProseMirrorNode, paragraphType: NodeType, tr: Transaction): boolean {
  const flags = computeClearFloatFlags(doc);
  let modified = false;
  let index = 0;

  doc.forEach((node, offset) => {
    const should = flags[index] ?? false;
    index += 1;
    if (node.type !== paragraphType) return;
    const current = Boolean(node.attrs.clearFloat);
    if (current === should) return;
    tr.setNodeMarkup(offset, undefined, { ...node.attrs, clearFloat: should });
    modified = true;
  });

  return modified;
}

/** 段落：支持 data-clear-float，源码往返可保留「写到绕排图下方」 */
export const ClearFloatParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      clearFloat: {
        default: false,
        parseHTML: (el) => el.hasAttribute('data-clear-float'),
        renderHTML: (attrs) => (
          attrs.clearFloat
            ? { 'data-clear-float': '', class: 'article-clear-float' }
            : {}
        ),
      },
    };
  },
});

const syncKey = new PluginKey('clearFloatSync');

/** 根据双空行自动写入/保持段落 clearFloat 属性 */
export const ClearFloatSync = Extension.create({
  name: 'clearFloatSync',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: syncKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null;
          if (transactions.some(tr => tr.getMeta(syncKey))) return null;

          const paragraphType = newState.schema.nodes.paragraph;
          if (!paragraphType) return null;

          const tr = newState.tr;
          if (!syncClearFloatAttrs(newState.doc, paragraphType, tr)) return null;
          tr.setMeta(syncKey, true);
          return tr;
        },
      }),
    ];
  },
});
