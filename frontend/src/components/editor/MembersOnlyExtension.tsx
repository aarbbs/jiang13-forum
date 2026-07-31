import { Node, mergeAttributes } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { LockKeyhole, Trash2 } from 'lucide-react';

/** 查找光标所在的登录可见节点深度 */
function findMembersOnlyDepth($pos: {
  depth: number;
  node: (d: number) => { type: { name: string }; nodeSize: number };
  before: (d: number) => number;
  start: (d: number) => number;
}): number {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'membersOnly') return d;
  }
  return -1;
}

/** 登录可见区块是否无实质文字 */
function isMembersOnlyEmpty(node: ProseMirrorNode): boolean {
  return node.textContent.trim().length === 0;
}

/** 编辑态「登录可见」区块视图 */
function MembersOnlyView({ selected, editor, node, getPos }: NodeViewProps) {
  const empty = isMembersOnlyEmpty(node);

  /** 按 NodeView 自身位置删除，不依赖光标是否仍在块内 */
  const deleteThisBlock = () => {
    const pos = getPos();
    if (typeof pos !== 'number') {
      editor.chain().focus().removeMembersOnly().run();
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
      editor.chain().focus().unwrapMembersOnly().run();
      return;
    }
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (isMembersOnlyEmpty(node)) {
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
      className={`post-members-only post-members-only--visible editor-members-only${selected ? ' editor-members-only--selected' : ''}${empty ? ' editor-members-only--empty' : ''}`}
    >
      <div className="post-members-only__badge" contentEditable={false}>
        <span className="post-members-only__badge-icon" aria-hidden="true">
          <LockKeyhole size={12} />
        </span>
        <span>登录可见</span>
        <div className="post-members-only__badge-actions">
          {!empty && (
            <button
              type="button"
              className="post-members-only__unwrap-btn"
              title="取消登录可见包裹，保留正文"
              onMouseDown={e => e.preventDefault()}
              onClick={handleUnwrap}
            >
              取消包裹
            </button>
          )}
          <button
            type="button"
            className="post-members-only__remove-btn"
            title={empty ? '删除空的登录可见区块' : '删除整个登录可见区块'}
            onMouseDown={e => e.preventDefault()}
            onClick={deleteThisBlock}
          >
            <Trash2 size={11} />
            删除
          </button>
        </div>
      </div>
      <NodeViewContent className="post-members-only__body" data-placeholder="此处内容游客不可见…" />
    </NodeViewWrapper>
  );
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    membersOnly: {
      insertMembersOnly: () => ReturnType;
      wrapMembersOnly: () => ReturnType;
      exitMembersOnly: () => ReturnType;
      unwrapMembersOnly: () => ReturnType;
      removeMembersOnly: () => ReturnType;
    };
  }
}

/** TipTap 自定义节点：登录可见内容区块 */
export const MembersOnly = Node.create({
  name: 'membersOnly',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'members-only' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['members-only', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MembersOnlyView);
  },

  addKeyboardShortcuts() {
    return {
      // 空区块内 Backspace / Delete：整块删除
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;

        const depth = findMembersOnlyDepth($from);
        if (depth < 0) return false;

        const node = $from.node(depth);
        if (!isMembersOnlyEmpty(node)) {
          // 有内容时：在区块首字位置再按 Backspace 则解除包裹（与常见编辑器一致）
          if ($from.parentOffset !== 0) return false;
          const start = $from.start(depth);
          if ($from.pos !== start) return false;
          return editor.commands.unwrapMembersOnly();
        }

        return editor.commands.removeMembersOnly();
      },
      Delete: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;

        const depth = findMembersOnlyDepth($from);
        if (depth < 0) return false;

        const node = $from.node(depth);
        if (!isMembersOnlyEmpty(node)) return false;

        return editor.commands.removeMembersOnly();
      },
      // 在区块末尾空行按 Enter 时退出到公开区域
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;

        const depth = findMembersOnlyDepth($from);
        if (depth < 0) return false;

        const parent = $from.parent;
        const atBlockEnd = $from.parentOffset === parent.content.size;
        const isEmptyBlock = parent.textContent.trim().length === 0;
        if (!atBlockEnd || !isEmptyBlock) return false;

        // 整块为空时直接删除，避免退出后仍残留空登录可见壳
        const membersNode = $from.node(depth);
        if (isMembersOnlyEmpty(membersNode) && membersNode.childCount <= 1) {
          return editor.commands.removeMembersOnly();
        }

        return editor.commands.exitMembersOnly();
      },
      // Ctrl+Enter / Cmd+Enter 退出到公开区域
      'Mod-Enter': ({ editor }) => {
        if (!editor.isActive('membersOnly')) return false;
        return editor.commands.exitMembersOnly();
      },
    };
  },

  addCommands() {
    return {
      insertMembersOnly: () => ({ chain }) => chain()
        .insertContent({
          type: this.name,
          content: [{ type: 'paragraph' }],
        })
        .run(),

      wrapMembersOnly: () => ({ tr, state, dispatch }) => {
        const { from, to, empty } = state.selection;
        if (empty) return false;

        const slice = state.doc.slice(from, to);
        if (!slice.content.size) return false;

        const node = state.schema.nodes.membersOnly.create(null, slice.content);
        if (dispatch) {
          tr.replaceRangeWith(from, to, node);
        }
        return true;
      },

      exitMembersOnly: () => ({ state, chain }) => {
        const { $from } = state.selection;
        const depth = findMembersOnlyDepth($from);
        if (depth < 0) return false;

        const pos = $from.before(depth);
        const node = $from.node(depth);
        const end = pos + node.nodeSize;

        return chain()
          .insertContentAt(end, { type: 'paragraph' })
          .setTextSelection(end + 1)
          .run();
      },

      unwrapMembersOnly: () => ({ tr, state, dispatch }) => {
        const { $from } = state.selection;
        const depth = findMembersOnlyDepth($from);
        if (depth < 0) return false;

        const pos = $from.before(depth);
        const node = $from.node(depth);

        // 空区块：直接删除，避免留下空段落套壳
        if (isMembersOnlyEmpty(node)) {
          tr.delete(pos, pos + node.nodeSize);
        } else {
          tr.replaceWith(pos, pos + node.nodeSize, node.content);
        }
        if (dispatch) dispatch(tr);
        return true;
      },

      removeMembersOnly: () => ({ tr, state, dispatch }) => {
        const { $from } = state.selection;
        const depth = findMembersOnlyDepth($from);
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
