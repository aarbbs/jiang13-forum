import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';

/** 单图展示形态（对齐 Notion / Medium 常见选项） */
export type ImageDisplay = 'default' | 'wide' | 'float-left' | 'float-right';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    articleImage: {
      setImageDisplay: (display: ImageDisplay) => ReturnType;
    };
  }
}

/**
 * 文章图片：在 TipTap Image 上增加 data-display，
 * 支持通栏 / 左绕排 / 右绕排。
 */
export const ArticleImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      display: {
        default: 'default' satisfies ImageDisplay,
        parseHTML: (el) =>
          (el.getAttribute('data-display') as ImageDisplay) || 'default',
        renderHTML: (attrs) => {
          const display = (attrs.display as ImageDisplay) || 'default';
          if (display === 'default') return {};
          return {
            'data-display': display,
            class: `article-img article-img--${display}`,
          };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const display = (HTMLAttributes['data-display'] as ImageDisplay) || 'default';
    const cls = [
      HTMLAttributes.class,
      'article-img',
      display !== 'default' ? `article-img--${display}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        class: cls || undefined,
        draggable: false,
      }),
    ];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageDisplay: (display) => ({ commands }) =>
        commands.updateAttributes(this.name, { display }),
    };
  },
});
