import type { Sticker } from './index';
import { getAllStickers } from './emojiData';
import { KAOMOJI_STICKERS } from './kaomoji';

/** 热门贴纸 — 从各平台精选 */
const HOT_KEYWORDS = [
  '笑哭', '开心', '大笑', '哈哈', '捂脸', '捂嘴', '飙泪笑',
  '酷', '怒', '哭', '大哭', '生气', '惊讶', '尴尬',
  '真棒', '赞', '666', '耶', '爱', '害羞', '思考',
  '滑稽', '吃瓜', '调皮', '发呆', '机智',
];

/** 热门贴纸懒加载：合并所有平台后按关键词筛选 */
export async function loadHotStickers(): Promise<Sticker[]> {
  const allEmoji = getAllStickers();
  const all = [...allEmoji, ...KAOMOJI_STICKERS];
  return all
    .filter((s) => {
      if (s.category === '颜文字') return true;
      return s.aliases?.some((a) => HOT_KEYWORDS.includes(a)) || HOT_KEYWORDS.includes(s.name);
    })
    .slice(0, 30)
    .map((s) => ({ ...s, category: '热门' as const }));
}
