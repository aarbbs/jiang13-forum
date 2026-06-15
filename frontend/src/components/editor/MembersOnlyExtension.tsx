import { Node, mergeAttributes } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { LockKeyhole, LogOut } from 'lucide-react';

/** 查找光标所在的登录可见节点深度 */
function findMembersOnlyDepth($pos: { depth: number; node: (d: number) => { type: { name: string } } }): number {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'membersOnly') return d;
  }
  return -1;
}

/** 编辑态「登录可见」区块视图 */
function MembersOnlyView({ selected, editor }: NodeViewProps) {
  const handleExit = () => {
    editor.chain().focus().exitMembersOnly().run();
  };

  const handleUnwrap = () => {
    editor.chain().focus().unwrapMembersOnly().run();
  };

  return (
    <NodeViewWrapper
      as="members-only"
      className={`post-members-only post-members-only--visible editor-members-only${selected ? ' editor-members-only--selected' : ''}`}
    >
      <div className="post-members-only__badge" contentEditable={false}>
        <span className="post-members-only__badge-icon" aria-hidden="true">
          <LockKeyhole size={12} />
        </span>
        <span>登录可见</span>
        <button
          type="button"
          className="post-members-only__exit-btn"
          title="Ctrl+Enter 退出到公开区域"
          onMouseDown={e => e.preventDefault()}
          onClick={handleExit}
        >
          <LogOut size={11} />
          退出
        </button>
        <span className="post-members-only__shortcut-hint">Ctrl+Enter 退出</span>
        <button
          type="button"
          className="post-members-only__unwrap-btn"
          title="取消登录可见包裹，保留正文"
          onMouseDown={e => e.preventDefault()}
          onClick={handleUnwrap}
        >
          取消包裹
        </button>
      </div>
      <NodeViewContent className="post-members-only__body" />
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
        tr.replaceWith(pos, pos + node.nodeSize, node.content);
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },
});
