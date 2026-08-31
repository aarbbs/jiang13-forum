import type { FeedSortId, FeedSortTab } from '../api/types';
import { DEFAULT_FEED_SORT_TABS } from '../api/types';

const FEED_SORT_IDS: FeedSortId[] = ['reply', 'latest', 'hot'];

const DEFAULT_LABELS: Record<FeedSortId, string> = {
  reply: '新评论',
  latest: '新帖子',
  hot: '推荐帖',
};

/** 校验并补全 Feed 排序标签；至少保留一项启用 */
export function normalizeFeedSortTabs(tabs?: FeedSortTab[] | null): FeedSortTab[] {
  const seen = new Set<FeedSortId>();
  const out: FeedSortTab[] = [];
  for (const t of tabs ?? []) {
    if (!FEED_SORT_IDS.includes(t.id) || seen.has(t.id)) continue;
    seen.add(t.id);
    const label = (t.label || '').trim() || DEFAULT_LABELS[t.id];
    out.push({ id: t.id, label, enabled: !!t.enabled });
  }
  for (const id of FEED_SORT_IDS) {
    if (seen.has(id)) continue;
    const fallback = DEFAULT_FEED_SORT_TABS.find(t => t.id === id)!;
    out.push({ ...fallback });
  }
  if (!out.some(t => t.enabled) && out.length > 0) {
    out[0] = { ...out[0], enabled: true };
  }
  return out;
}

/** 启用中的排序标签（按配置顺序） */
export function enabledFeedSortTabs(tabs?: FeedSortTab[] | null): FeedSortTab[] {
  return normalizeFeedSortTabs(tabs).filter(t => t.enabled);
}

/** 默认排序 = 第一个启用项 */
export function getDefaultFeedSort(tabs?: FeedSortTab[] | null): FeedSortId {
  return enabledFeedSortTabs(tabs)[0]?.id ?? 'reply';
}
