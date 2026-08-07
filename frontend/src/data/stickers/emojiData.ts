import type { Sticker, StickerCategory } from './index';
import emojiJson from './emoji.json';

/** 平台 → 分类名映射 */
const PLATFORM_TO_CATEGORY: Record<string, StickerCategory> = {
  tieba: '贴吧',
  zhihu: '知乎',
  xiaohongshu: '小红书',
  douyin: '抖音',
  bilibili: 'B站',
  weibo: '微博',
};

interface EmojiItem {
  url: string;
  name: string;
  tags: string[];
  keywords: string[];
}

/** 将 emoji.json 的 url (output/tieba/tb_01.avif) 转为本地路径 (/stickers/tieba/tb_01.avif) */
function toLocalUrl(url: string): string {
  // output/tieba/tb_01.avif → /stickers/tieba/tb_01.avif
  return url.replace(/^output\//, '/stickers/');
}

/** 缓存：平台 → Sticker[] */
const cache = new Map<string, Sticker[]>();

/** 按平台获取贴纸列表 */
export function getStickersByPlatform(platform: string): Sticker[] {
  if (cache.has(platform)) return cache.get(platform)!;

  const category = PLATFORM_TO_CATEGORY[platform];
  if (!category) return [];

  const entry = (emojiJson as Array<{ platform: string; emojis: EmojiItem[] }>)
    .find((p) => p.platform === platform);
  if (!entry) return [];

  const stickers: Sticker[] = entry.emojis.map((e, i) => ({
    id: `${platform}-${i + 1}`,
    name: e.name,
    category,
    type: 'image' as const,
    url: toLocalUrl(e.url),
    aliases: e.keywords,
  }));

  cache.set(platform, stickers);
  return stickers;
}

/** 获取所有平台的贴纸（用于热门筛选） */
export function getAllStickers(): Sticker[] {
  return Object.keys(PLATFORM_TO_CATEGORY).flatMap((p) => getStickersByPlatform(p));
}
