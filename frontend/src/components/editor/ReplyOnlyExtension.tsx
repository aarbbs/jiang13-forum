import { Node, mergeAttributes } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { MessageSquareLock, Trash2 } from 'lucide-react';

/** 查找光标所在的回复可见节点深度 */
function findReplyOnlyDepth($pos: {
  depth: number;
  node: (d: number) => { type: { name: string }; nodeSize: number };
  before: (d: number) => number;
  start: (d: number) => number;
}): number {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'replyOnly') return d;
  }
  return -1;
}

/** 回复可见区块是否无实质文字 */
function isReplyOnlyEmpty(node: ProseMirrorNode): boolean {
  return node.textContent.trim().length === 0;
}

/** 编辑态「回复可见」区块视图 */
function ReplyOnlyView({ selected, editor, node, getPos }: NodeViewProps) {
  const empty = isReplyOnlyEmpty(node);

  const deleteThisBlock = () => {
    const pos = getPos();
    if (typeof pos !== 'number') {
      editor.chain().focus().removeReplyOnly().run();
      return;
    }
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (dispatch) tr.delete(pos, pos + node.nodeSize);
        return true;
      })
      .run();
  };

  const handleUnwrap = () => {
    const pos = getPos();
    if (typeof pos !== 'number') {
      editor.chain().focus().unwrapReplyOnly().run();
      return;
    }
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (isReplyOnlyEmpty(node)) {
          if (dispatch) tr.delete(pos, pos + node.nodeSize);
        } else if (dispatch) {
          tr.replaceWith(pos, pos + node.nodeSize, node.content);
        }
        return true;
      })
      .run();
  };

  return (
    <NodeViewWrapper
      className={`post-reply-only post-reply-only--visible editor-reply-only${selected ? ' editor-reply-only--selected' : ''}${empty ? ' editor-reply-only--empty' : ''}`}
    >
      <div className="post-reply-only__badge" contentEditable={false}>
        <span className="post-reply-only__badge-icon" aria-hidden="true">
          <MessageSquareLock size={12} />
        </span>
        <span>回复可见</span>
        <div className="post-reply-only__badge-actions">
          {!empty && (
            <button
              type="button"
              className="post-reply-only__unwrap-btn"
              title="取消回复可见包裹，保留正文"
              onMouseDown={e => e.preventDefault()}
              onClick={handleUnwrap}
            >
              取消包裹
            </button>
          )}
          <button
            type="button"
            className="post-reply-only__remove-btn"
            title={empty ? '删除空的回复可见区块' : '删除整个回复可见区块'}
            onMouseDown={e => e.preventDefault()}
            onClick={deleteThisBlock}
          >
            <Trash2 size={11} />
            删除
          </button>
        </div>
      </div>
      <NodeViewContent className="post-reply-only__body" data-placeholder="此处内容需回复后可见…" />
    </NodeViewWrapper>
  );
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    replyOnly: {
      insertReplyOnly: () => ReturnType;
      wrapReplyOnly: () => ReturnType;
      exitReplyOnly: () => ReturnType;
      unwrapReplyOnly: () => ReturnType;
      removeReplyOnly: () => ReturnType;
    };
  }
}

/** TipTap 自定义节点：回复后可见内容区块 */
export const ReplyOnly = Node.create({
  name: 'replyOnly',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'reply-only' }];
  },

  renderHTML({ HTMLAttributes }) {
    // data-gate：消毒白名单要求自定义标签带允许属性，否则会被剥壳
    return ['reply-only', mergeAttributes({ 'data-gate': 'reply' }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReplyOnlyView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;

        const depth = findReplyOnlyDepth($from);
        if (depth < 0) return false;

        const node = $from.node(depth);
        if (!isReplyOnlyEmpty(node)) {
          if ($from.parentOffset !== 0) return false;
          const start = $from.start(depth);
          if ($from.pos !== start) return false;
          return editor.commands.unwrapReplyOnly();
        }

        return editor.commands.removeReplyOnly();
      },
      Delete: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;

        const depth = findReplyOnlyDepth($from);
        if (depth < 0) return false;

        const node = $from.node(depth);
        if (!isReplyOnlyEmpty(node)) return false;

        return editor.commands.removeReplyOnly();
      },
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;

        const depth = findReplyOnlyDepth($from);
        if (depth < 0) return false;

        const parent = $from.parent;
        const atBlockEnd = $from.parentOffset === parent.content.size;
        const isEmptyBlock = parent.textContent.trim().length === 0;
        if (!atBlockEnd || !isEmptyBlock) return false;

        const replyNode = $from.node(depth);
        if (isReplyOnlyEmpty(replyNode) && replyNode.childCount <= 1) {
          return editor.commands.removeReplyOnly();
        }

        return editor.commands.exitReplyOnly();
      },
      'Mod-Enter': ({ editor }) => {
        if (!editor.isActive('replyOnly')) return false;
        return editor.commands.exitReplyOnly();
      },
    };
  },

  addCommands() {
    return {
      insertReplyOnly: () => ({ chain }) => chain()
        .insertContent({
          type: this.name,
          content: [{ type: 'paragraph' }],
        })
        .run(),

      wrapReplyOnly: () => ({ tr, state, dispatch }) => {
        const { from, to, empty } = state.selection;
        if (empty) return false;

        const slice = state.doc.slice(from, to);
        if (!slice.content.size) return false;

        const node = state.schema.nodes.replyOnly.create(null, slice.content);
        if (dispatch) {
          tr.replaceRangeWith(from, to, node);
        }
        return true;
      },

      exitReplyOnly: () => ({ state, chain }) => {
        const { $from } = state.selection;
        const depth = findReplyOnlyDepth($from);
        if (depth < 0) return false;

        const pos = $from.before(depth);
        const node = $from.node(depth);
        const end = pos + node.nodeSize;

        return chain()
          .insertContentAt(end, { type: 'paragraph' })
          .setTextSelection(end + 1)
          .run();
      },

      unwrapReplyOnly: () => ({ tr, state, dispatch }) => {
        const { $from } = state.selection;
        const depth = findReplyOnlyDepth($from);
        if (depth < 0) return false;

        const pos = $from.before(depth);
        const node = $from.node(depth);

        if (isReplyOnlyEmpty(node)) {
          tr.delete(pos, pos + node.nodeSize);
        } else {
          tr.replaceWith(pos, pos + node.nodeSize, node.content);
        }
        if (dispatch) dispatch(tr);
        return true;
      },

      removeReplyOnly: () => ({ tr, state, dispatch }) => {
        const { $from } = state.selection;
        const depth = findReplyOnlyDepth($from);
        if (depth < 0) return false;

        const pos = $from.before(depth);
        const node = $from.node(depth);
        tr.delete(pos, pos + node.nodeSize);
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },
});
