import { useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { boardPath, parsePermalinkID, type PermalinkOpts } from '../utils/permalink';
import { getCachedForumLimits, useForumLimits } from '../hooks/useForumLimits';
import { Clock, MessageCircle, BadgeCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { moveTabIndex } from '../hooks/useOverlayA11y';
import {
  enabledFeedSortTabs,
  getDefaultFeedSort,
  normalizeFeedSortTabs,
} from '../utils/feedSortTabs';
import type { FeedSortTab } from '../api/types';

export type FeedSort = 'latest' | 'reply' | 'hot';

const SORT_META: Record<FeedSort, { hint: string; icon: typeof Clock }> = {
  reply: { hint: '最近有人评论', icon: MessageCircle },
  latest: { hint: '按发帖时间', icon: Clock },
  hot: { hint: '仅展示推荐帖', icon: BadgeCheck },
};

interface Props {
  value: FeedSort;
  onChange: (sort: FeedSort) => void;
  postTotal?: number;
  /** 正在加载、尚未提交到画面的目标排序 */
  pendingValue?: FeedSort | null;
}

/** 当前配置下的默认排序（读缓存，供非 hook 路径） */
export function getDefaultFeedSortFromCache(): FeedSort {
  return getDefaultFeedSort(getCachedForumLimits().feed_sort_tabs);
}

/** 解析 URL sort；未启用或不合法时回落默认 */
export function parseFeedSort(raw: string | null, tabs?: FeedSortTab[] | null): FeedSort {
  const list = tabs ?? getCachedForumLimits().feed_sort_tabs;
  const def = getDefaultFeedSort(list);
  if (raw === 'latest' || raw === 'hot' || raw === 'reply') {
    const enabled = enabledFeedSortTabs(list).some(t => t.id === raw);
    if (enabled) return raw;
  }
  return def;
}

export function buildHomeUrl(
  boardId: number,
  sort?: FeedSort,
  opts?: { keyword?: string; tag?: string; author?: string; titleOnly?: boolean; permalink?: PermalinkOpts },
) {
  const def = getDefaultFeedSortFromCache();
  const effective = sort ?? def;
  const p = new URLSearchParams();
  const tag = opts?.tag?.trim();
  const keyword = opts?.keyword?.trim();
  const author = opts?.author?.trim();
  // 标签筛选与关键词搜索互斥：有 tag 时不带 keyword
  if (tag) p.set('tag', tag);
  else if (keyword) {
    p.set('keyword', keyword);
    if (opts?.titleOnly) p.set('title_only', '1');
    if (author) p.set('author', author);
  } else if (author) {
    p.set('author', author);
  }
  // 默认排序不写进 URL
  if (effective !== def) p.set('sort', effective);
  const qs = p.toString();

  if (boardId) {
    const base = boardPath(boardId, opts?.permalink ?? getCachedForumLimits());
    return qs ? `${base}?${qs}` : base;
  }
  return qs ? `/?${qs}` : '/';
}

export function feedSortLabel(sort: FeedSort, tabs?: FeedSortTab[] | null): string {
  const list = normalizeFeedSortTabs(tabs ?? getCachedForumLimits().feed_sort_tabs);
  return list.find(t => t.id === sort)?.label ?? '帖子列表';
}

export default function FeedSortBar({
  value,
  onChange,
  postTotal,
  pendingValue,
}: Props) {
  const { limits } = useForumLimits();
  const { id: boardRouteId } = useParams();
  const [params] = useSearchParams();
  // 与 SSR href / HomePage 一致：从路由与查询串解析板块与筛选
  const boardId = boardRouteId
    ? (() => {
        const id = parsePermalinkID(boardRouteId);
        return Number.isFinite(id) && id > 0 ? id : 0;
      })()
    : (Number(params.get('board')) || 0);
  const keyword = params.get('keyword') || '';
  const tag = params.get('tag') || '';
  const author = params.get('author') || '';
  const titleOnly = params.get('title_only') === '1';

  const options = useMemo(
    () => enabledFeedSortTabs(limits.feed_sort_tabs).map(t => ({
      key: t.id as FeedSort,
      label: t.label,
      hint: SORT_META[t.id]?.hint ?? '',
      icon: SORT_META[t.id]?.icon ?? Clock,
      href: buildHomeUrl(boardId, t.id as FeedSort, {
        keyword,
        tag,
        author,
        titleOnly,
        permalink: limits,
      }),
    })),
    [limits, boardId, keyword, tag, author, titleOnly],
  );

  const listRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, options.findIndex(o => o.key === value));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = moveTabIndex(e.key, activeIndex, options.length);
    if (next == null) return;
    e.preventDefault();
    onChange(options[next].key);
    requestAnimationFrame(() => {
      const tabs = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
      tabs?.[next]?.focus();
    });
  };

  if (options.length === 0) return null;

  return (
    <div className="feed-toolbar">
      <div
        ref={listRef}
        className="feed-sort-bar"
        role="tablist"
        aria-label="帖子排序"
        onKeyDown={onKeyDown}
      >
        {options.map(({ key, label, hint, icon: Icon, href }, i) => {
          const pending = pendingValue === key;
          return (
            <a
              key={key}
              href={href}
              role="tab"
              tabIndex={activeIndex === i ? 0 : -1}
              aria-selected={value === key}
              aria-busy={pending || undefined}
              title={`${label} · ${hint}`}
              className={cn('feed-sort-tab', value === key && 'active', pending && 'is-pending')}
              onClick={(e) => {
                e.preventDefault();
                onChange(key);
              }}
            >
              {pending
                ? <Loader2 className="feed-sort-tab__spin" aria-hidden />
                : <Icon aria-hidden />}
              <span className="feed-sort-tab__label">{label}</span>
            </a>
          );
        })}
      </div>
      {postTotal != null && (
        <span className="feed-toolbar__count">共 {postTotal} 条</span>
      )}
    </div>
  );
}
