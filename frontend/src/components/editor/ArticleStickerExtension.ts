import { Node, mergeAttributes } from '@tiptap/core';

/** 贴纸资源路径：评论、私信、发帖共用 /stickers/ */
export function isStickerSrc(src: string | null | undefined): boolean {
  return typeof src === 'string' && src.includes('/stickers/');
}

/**
 * 行内表情贴纸。文章 Image 是 block，不能拿来插表情，否则会独自占一段。
 * 解析 HTML 时优先于普通 img，避免贴纸被收成通栏大图。
 */
export const ArticleSticker = Node.create({
  name: 'sticker',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  priority: 60,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const src = node.getAttribute('src') || '';
          if (!isStickerSrc(src)) return false;
          return {
            src,
            alt: node.getAttribute('alt') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        class: 'article-sticker',
        draggable: 'false',
      }),
    ];
  },
});
