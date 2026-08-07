/** 贴纸类型定义（URL 方式，非 sprite 裁切） */

export type StickerCategory = '热门' | '贴吧' | '知乎' | '小红书' | '抖音' | 'B站' | '微博' | '颜文字';

export type StickerType = 'image' | 'text';

export interface Sticker {
  id: string;
  name: string;
  category: StickerCategory;
  aliases?: string[];
  type: StickerType;
  /** image 类型：图片路径（相对于 public 目录） */
  url?: string;
  /** text 类型：颜文字字符串 */
  text?: string;
}

export const STICKER_CATEGORIES: StickerCategory[] = ['热门', '贴吧', '知乎', '小红书', '抖音', 'B站', '微博', '颜文字'];

const CATEGORY_LOADERS: Record<StickerCategory, () => Promise<Sticker[]>> = {
  '热门': () => import('./hot').then(m => m.loadHotStickers()),
  '贴吧': () => import('./emojiData').then(m => m.getStickersByPlatform('tieba')),
  '知乎': () => import('./emojiData').then(m => m.getStickersByPlatform('zhihu')),
  '小红书': () => import('./emojiData').then(m => m.getStickersByPlatform('xiaohongshu')),
  '抖音': () => import('./emojiData').then(m => m.getStickersByPlatform('douyin')),
  'B站': () => import('./emojiData').then(m => m.getStickersByPlatform('bilibili')),
  '微博': () => import('./emojiData').then(m => m.getStickersByPlatform('weibo')),
  '颜文字': () => import('./kaomoji').then(m => m.KAOMOJI_STICKERS),
};

/** 按分类动态加载贴纸数据 */
export async function loadStickersByCategory(cat: StickerCategory): Promise<Sticker[]> {
  return CATEGORY_LOADERS[cat]();
}
