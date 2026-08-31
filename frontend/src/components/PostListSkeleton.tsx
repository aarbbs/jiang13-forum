import type { ForumLimitsPublic } from '../api/types';

export type FeedListStyle = ForumLimitsPublic['feed_list_style'];

/** 虚拟列表行高预估值 */
export function feedListRowEstimate(style: FeedListStyle): number {
  switch (style) {
    case 'excerpt': return 68;
    case 'thumbnail': return 72;
    default: return 64;
  }
}
