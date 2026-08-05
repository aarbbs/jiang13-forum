import { Node, mergeAttributes } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { Coins, Trash2 } from 'lucide-react';

function findPointsOnlyDepth($pos: {
  depth: number;
  node: (d: number) => { type: { name: string }; nodeSize: number };
  before: (d: number) => number;
  start: (d: number) => number;
}): number {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'pointsOnly') return d;
  }
  return -1;
}

function isPointsOnlyEmpty(node: ProseMirrorNode): boolean {
  return node.textContent.trim().length === 0;
}

function PointsOnlyView({ selected, editor, node, getPos, updateAttributes }: NodeViewProps) {
  const empty = isPointsOnlyEmpty(node);
  const cost = Number(node.attrs.cost) || 10;

  const deleteThisBlock = () => {
    const pos = getPos();
    if (typeof pos !== 'number') {
      editor.chain().focus().removePointsOnly().run();
      return;
    }
    editor.chain().focus().command(({ tr, dispatch }) => {
      if (dispatch) tr.delete(pos, pos + node.nodeSize);
      return true;
    }).run();
  };

  return (
    <NodeViewWrapper
      className={`post-points-only post-points-only--visible editor-points-only${selected ? ' editor-points-only--selected' : ''}${empty ? ' editor-points-only--empty' : ''}`}
    >
      <div className="post-points-only__badge" contentEditable={false}>
        <span className="post-points-only__badge-icon" aria-hidden="true">
          <Coins size={12} />
        </span>
        <span>积分可见</span>
        <label className="post-points-only__cost">
          价格
          <input
            type="number"
            min={1}
            max={9999}
            value={cost}
            onMouseDown={e => e.preventDefault()}
            onChange={e => {
              const v = Math.max(1, Math.min(9999, Number(e.target.value) || 1));
              updateAttributes({ cost: v });
            }}
          />
        </label>
        <div className="post-points-only__badge-actions">
          <button
            type="button"
            className="post-points-only__remove-btn"
            title="删除积分可见区块"
            onMouseDown={e => e.preventDefault()}
            onClick={deleteThisBlock}
          >
            <Trash2 size={11} />
            删除
          </button>
        </div>
      </div>
      <NodeViewContent className="post-points-only__body" data-placeholder="此处内容需积分解锁后可见…" />
    </NodeViewWrapper>
  );
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pointsOnly: {
      insertPointsOnly: (cost?: number) => ReturnType;
      wrapPointsOnly: (cost?: number) => ReturnType;
      exitPointsOnly: () => ReturnType;
      removePointsOnly: () => ReturnType;
    };
  }
}

/** TipTap：积分可见内容区块 */
export const PointsOnly = Node.create({
  name: 'pointsOnly',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      cost: {
        default: 10,
        parseHTML: el => {
          const v = Number(el.getAttribute('data-cost'));
          return v > 0 ? v : 10;
        },
        renderHTML: attrs => ({ 'data-cost': String(attrs.cost || 10) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'points-only' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['points-only', mergeAttributes({ 'data-gate': 'points' }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PointsOnlyView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        const depth = findPointsOnlyDepth($from);
        if (depth < 0) return false;
        const node = $from.node(depth);
        if (!isPointsOnlyEmpty(node)) {
          if ($from.parentOffset !== 0) return false;
          if ($from.pos !== $from.start(depth)) return false;
        }
        return editor.commands.removePointsOnly();
      },
      Delete: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        const depth = findPointsOnlyDepth($from);
        if (depth < 0) return false;
        if (!isPointsOnlyEmpty($from.node(depth))) return false;
        return editor.commands.removePointsOnly();
      },
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        const depth = findPointsOnlyDepth($from);
        if (depth < 0) return false;
        const parent = $from.parent;
        if ($from.parentOffset !== parent.content.size || parent.textContent.trim().length > 0) return false;
        const node = $from.node(depth);
        if (isPointsOnlyEmpty(node) && node.childCount <= 1) {
          return editor.commands.removePointsOnly();
        }
        return editor.commands.exitPointsOnly();
      },
      'Mod-Enter': ({ editor }) => {
        if (!editor.isActive('pointsOnly')) return false;
        return editor.commands.exitPointsOnly();
      },
    };
  },

  addCommands() {
    return {
      insertPointsOnly: (cost = 10) => ({ chain }) => chain()
        .insertContent({
          type: this.name,
          attrs: { cost },
          content: [{ type: 'paragraph' }],
        })
        .run(),

      wrapPointsOnly: (cost = 10) => ({ tr, state, dispatch }) => {
        const { from, to, empty } = state.selection;
        if (empty) return false;
        const slice = state.doc.slice(from, to);
        if (!slice.content.size) return false;
        const node = state.schema.nodes.pointsOnly.create({ cost }, slice.content);
        if (dispatch) tr.replaceRangeWith(from, to, node);
        return true;
      },

      exitPointsOnly: () => ({ state, chain }) => {
        const { $from } = state.selection;
        const depth = findPointsOnlyDepth($from);
        if (depth < 0) return false;
        const pos = $from.before(depth);
        const node = $from.node(depth);
        const end = pos + node.nodeSize;
        return chain()
          .insertContentAt(end, { type: 'paragraph' })
          .setTextSelection(end + 1)
          .run();
      },

      removePointsOnly: () => ({ tr, state, dispatch }) => {
        const { $from } = state.selection;
        const depth = findPointsOnlyDepth($from);
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
