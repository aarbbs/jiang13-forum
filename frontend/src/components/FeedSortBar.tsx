import { useRef } from 'react';
import { Clock, MessageCircle, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { moveTabIndex } from '../hooks/useOverlayA11y';

export type FeedSort = 'latest' | 'reply' | 'hot';

const SORT_OPTIONS: {
  key: FeedSort;
  label: string;
  hint: string;
  icon: typeof Clock;
}[] = [
  { key: 'latest', label: '最新发帖', hint: '按发布时间', icon: Clock },
  { key: 'reply', label: '最新回复', hint: '最近有人回复', icon: MessageCircle },
  { key: 'hot', label: '热门讨论', hint: '按互动热度', icon: Flame },
];

interface Props {
  value: FeedSort;
  onChange: (sort: FeedSort) => void;
  postTotal?: number;
}

export function parseFeedSort(raw: string | null): FeedSort {
  if (raw === 'reply' || raw === 'hot') return raw;
  return 'latest';
}

export function buildHomeUrl(
  boardId: number,
  sort: FeedSort = 'latest',
  opts?: { keyword?: string; tag?: string },
) {
  const p = new URLSearchParams();
  if (boardId) p.set('board', String(boardId));
  const tag = opts?.tag?.trim();
  const keyword = opts?.keyword?.trim();
  // 标签筛选与关键词搜索互斥：有 tag 时不带 keyword
  if (tag) p.set('tag', tag);
  else if (keyword) p.set('keyword', keyword);
  if (sort !== 'latest') p.set('sort', sort);
  const qs = p.toString();
  return qs ? `/?${qs}` : '/';
}

export function feedSortLabel(sort: FeedSort): string {
  return SORT_OPTIONS.find(o => o.key === sort)?.label ?? '帖子列表';
}

export default function FeedSortBar({ value, onChange, postTotal }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, SORT_OPTIONS.findIndex(o => o.key === value));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = moveTabIndex(e.key, activeIndex, SORT_OPTIONS.length);
    if (next == null) return;
    e.preventDefault();
    onChange(SORT_OPTIONS[next].key);
    requestAnimationFrame(() => {
      const tabs = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
      tabs?.[next]?.focus();
    });
  };

  return (
    <div className="feed-toolbar">
      <div
        ref={listRef}
        className="feed-sort-bar"
        role="tablist"
        aria-label="帖子排序"
        onKeyDown={onKeyDown}
      >
        {SORT_OPTIONS.map(({ key, label, hint, icon: Icon }, i) => (
        <button
          key={key}
          type="button"
          role="tab"
          tabIndex={activeIndex === i ? 0 : -1}
          aria-selected={value === key}
          title={`${label} · ${hint}`}
          className={cn('feed-sort-tab', value === key && 'active')}
          onClick={() => onChange(key)}
        >
          <Icon aria-hidden />
          <span className="feed-sort-tab__label">{label}</span>
        </button>
      ))}
      </div>
      {postTotal != null && (
        <span className="feed-toolbar__count">共 {postTotal} 条</span>
      )}
    </div>
  );
}
