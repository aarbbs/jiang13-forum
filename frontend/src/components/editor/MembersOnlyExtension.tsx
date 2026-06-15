import { Node, mergeAttributes } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { LockKeyhole } from 'lucide-react';

/** 编辑态「登录可见」区块视图 */
function MembersOnlyView({ selected }: NodeViewProps) {
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

  addCommands() {
    return {
      insertMembersOnly: () => ({ chain }) => chain()
        .insertContent({
          type: this.name,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: '在此输入仅登录用户可见的内容…' }],
          }],
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
    };
  },
});
