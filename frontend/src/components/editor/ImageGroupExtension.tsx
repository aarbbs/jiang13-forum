import { Node, mergeAttributes } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { Columns2, Columns3, LayoutGrid, Plus, Ungroup } from 'lucide-react';
import { api } from '../../api/client';
import { notify } from '@/lib/notify';

export type ImageGroupLayout = 'cols-2' | 'cols-3' | 'cols-4';

const LAYOUTS: { key: ImageGroupLayout; label: string; icon: typeof Columns2; hint: string }[] = [
  { key: 'cols-2', label: '两列', icon: Columns2, hint: '并排两张' },
  { key: 'cols-3', label: '三列', icon: Columns3, hint: '并排三张' },
  { key: 'cols-4', label: '四列', icon: LayoutGrid, hint: '四宫格' },
];

/** 按张数推荐默认布局 */
export function suggestImageGroupLayout(count: number): ImageGroupLayout {
  if (count >= 4) return 'cols-4';
  if (count === 3) return 'cols-3';
  return 'cols-2';
}

function findImageGroupDepth($pos: {
  depth: number;
  node: (d: number) => { type: { name: string } };
}): number {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'imageGroup') return d;
  }
  return -1;
}

/** 空段落可夹在连续图片之间，合并时一并吃掉 */
function isEmptyParagraph(node: ProseMirrorNode): boolean {
  return node.type.name === 'paragraph' && node.content.size === 0;
}

/** 定位一张可作为合并起点的图片位置 */
function findAnchorImagePos(state: EditorState): number | null {
  const { selection, doc } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
    return selection.from;
  }

  const { $from, from, to } = selection;
  if (findImageGroupDepth($from) >= 0) return null;

  let firstImagePos: number | null = null;
  doc.nodesBetween(from, Math.max(to, from + 1), (node, pos) => {
    if (node.type.name === 'image' && firstImagePos == null) {
      firstImagePos = pos;
      return false;
    }
    return undefined;
  });
  if (firstImagePos != null) return firstImagePos;

  if ($from.nodeBefore?.type.name === 'image') {
    return $from.pos - $from.nodeBefore.nodeSize;
  }
  if ($from.nodeAfter?.type.name === 'image') {
    return $from.pos;
  }

  // 光标在图片之间的段落时：沿祖先层级找相邻图片块
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const parent = $from.node(depth);
    const index = $from.index(depth);

    for (let i = index - 1; i >= 0; i -= 1) {
      const n = parent.child(i);
      if (n.type.name === 'image') return $from.posAtIndex(i, depth);
      if (!isEmptyParagraph(n)) break;
    }
    for (let i = index + 1; i < parent.childCount; i += 1) {
      const n = parent.child(i);
      if (n.type.name === 'image') return $from.posAtIndex(i, depth);
      if (!isEmptyParagraph(n)) break;
    }
  }
  return null;
}

/**
 * 以某张图为锚点，向两侧扩展「连续图片块」
 * （允许中间夹空段落；富文本难以框选多张 atom 图片）
 */
function collectConsecutiveImageRun(
  state: EditorState,
  imagePos: number,
): { from: number; to: number; images: ProseMirrorNode[] } | null {
  const node = state.doc.nodeAt(imagePos);
  if (!node || node.type.name !== 'image') return null;

  const $pos = state.doc.resolve(imagePos);
  const parent = $pos.parent;
  const index = $pos.index();
  if (parent.child(index) !== node) return null;

  let start = index;
  while (start > 0) {
    const prev = parent.child(start - 1);
    if (prev.type.name === 'image' || isEmptyParagraph(prev)) start -= 1;
    else break;
  }
  while (start < index && isEmptyParagraph(parent.child(start))) start += 1;

  let end = index;
  while (end < parent.childCount - 1) {
    const next = parent.child(end + 1);
    if (next.type.name === 'image' || isEmptyParagraph(next)) end += 1;
    else break;
  }
  while (end > index && isEmptyParagraph(parent.child(end))) end -= 1;

  const images: ProseMirrorNode[] = [];
  for (let i = start; i <= end; i += 1) {
    const child = parent.child(i);
    if (child.type.name === 'image') images.push(child);
  }
  if (images.length < 2) return null;

  let from = $pos.start();
  for (let i = 0; i < start; i += 1) from += parent.child(i).nodeSize;
  let to = from;
  for (let i = start; i <= end; i += 1) to += parent.child(i).nodeSize;

  return { from, to, images };
}

function ImageGroupView({ selected, editor, node, getPos }: NodeViewProps) {
  const layout = (node.attrs.layout as ImageGroupLayout) || 'cols-2';
  const count = node.childCount;

  const setLayout = (next: ImageGroupLayout) => {
    const pos = getPos();
    if (typeof pos !== 'number') {
      editor.chain().focus().setImageGroupLayout(next).run();
      return;
    }
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, layout: next });
        return true;
      })
      .run();
  };

  const unwrap = () => {
    const pos = getPos();
    if (typeof pos !== 'number') {
      editor.chain().focus().unwrapImageGroup().run();
      return;
    }
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (dispatch) tr.replaceWith(pos, pos + node.nodeSize, node.content);
        return true;
      })
      .run();
  };

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.multiple = true;
    input.onchange = async () => {
      const files = [...(input.files ?? [])];
      if (!files.length) return;
      const urls: string[] = [];
      for (const file of files) {
        try {
          const { url } = await api.uploadPostImage(file);
          urls.push(url);
        } catch (e: unknown) {
          notify.error(e instanceof Error ? e.message : '图片上传失败');
        }
      }
      if (!urls.length) return;
      const pos = getPos();
      if (typeof pos !== 'number') return;
      editor
        .chain()
        .focus()
        .command(({ tr, dispatch, state }) => {
          const imageType = state.schema.nodes.image;
          if (!imageType || !dispatch) return false;
          let cur = pos + node.nodeSize - 1;
          for (const src of urls) {
            const img = imageType.create({ src });
            tr.insert(cur, img);
            cur += img.nodeSize;
          }
          const nextLayout = suggestImageGroupLayout(count + urls.length);
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, layout: nextLayout });
          return true;
        })
        .run();
    };
    input.click();
  };

  return (
    <NodeViewWrapper
      className={`image-group image-group--${layout}${selected ? ' image-group--selected' : ''}`}
      data-image-group=""
      data-layout={layout}
    >
      <div className="image-group__toolbar" contentEditable={false}>
        <span className="image-group__toolbar-label">图组 · {count} 张</span>
        <div className="image-group__toolbar-actions">
          {LAYOUTS.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={`image-group__layout-btn${layout === item.key ? ' is-active' : ''}`}
                title={item.hint}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setLayout(item.key)}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="image-group__layout-btn"
            title="向本组追加图片"
            onMouseDown={e => e.preventDefault()}
            onClick={addImage}
          >
            <Plus size={14} />
            <span>添加</span>
          </button>
          <button
            type="button"
            className="image-group__layout-btn"
            title="拆开为单独图片"
            onMouseDown={e => e.preventDefault()}
            onClick={unwrap}
          >
            <Ungroup size={14} />
            <span>拆开</span>
          </button>
        </div>
      </div>
      <NodeViewContent className="image-group__grid" as="div" />
    </NodeViewWrapper>
  );
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageGroup: {
      insertImageGroup: (srcs: string[], layout?: ImageGroupLayout) => ReturnType;
      setImageGroupLayout: (layout: ImageGroupLayout) => ReturnType;
      unwrapImageGroup: () => ReturnType;
      wrapImagesInGroup: () => ReturnType;
    };
  }
}

/** TipTap 图组：多图并排 / 宫格布局 */
export const ImageGroup = Node.create({
  name: 'imageGroup',
  group: 'block',
  content: 'image+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      layout: {
        default: 'cols-2' satisfies ImageGroupLayout,
        parseHTML: (el) => (el.getAttribute('data-layout') as ImageGroupLayout) || 'cols-2',
        renderHTML: (attrs) => ({ 'data-layout': attrs.layout || 'cols-2' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-image-group]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const layout = HTMLAttributes['data-layout'] || 'cols-2';
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-image-group': '',
        'data-layout': layout,
        class: `image-group image-group--${layout}`,
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageGroupView);
  },

  addCommands() {
    return {
      insertImageGroup: (srcs, layout) => ({ chain }) => {
        if (!srcs.length) return false;
        const nextLayout = layout || suggestImageGroupLayout(srcs.length);
        return chain()
          .insertContent({
            type: this.name,
            attrs: { layout: nextLayout },
            content: srcs.map(src => ({ type: 'image', attrs: { src } })),
          })
          .run();
      },

      setImageGroupLayout: (layout) => ({ commands }) =>
        commands.updateAttributes(this.name, { layout }),

      unwrapImageGroup: () => ({ tr, state, dispatch }) => {
        const { $from } = state.selection;
        const depth = findImageGroupDepth($from);
        if (depth < 0) return false;
        const pos = $from.before(depth);
        const node = $from.node(depth);
        tr.replaceWith(pos, pos + node.nodeSize, node.content);
        if (dispatch) dispatch(tr);
        return true;
      },

      /**
       * 将光标/选区附近的连续图片包成图组。
       * TipTap 图片是 atom，无法像文本那样拖选多张，因此自动扩展相邻图片。
       */
      wrapImagesInGroup: () => ({ tr, state, dispatch }) => {
        const anchor = findAnchorImagePos(state);
        if (anchor == null) return false;
        const run = collectConsecutiveImageRun(state, anchor);
        if (!run) return false;

        const groupType = state.schema.nodes.imageGroup;
        if (!groupType) return false;

        const group = groupType.create(
          { layout: suggestImageGroupLayout(run.images.length) },
          run.images,
        );
        if (dispatch) {
          tr.replaceWith(run.from, run.to, group);
          // 选中新建图组，便于立刻改列数
          tr.setSelection(NodeSelection.create(tr.doc, run.from));
        }
        return true;
      },
    };
  },
});
