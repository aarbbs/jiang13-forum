import { Clock, MessageCircle, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export function buildHomeUrl(boardId: number, sort: FeedSort = 'latest') {
  const p = new URLSearchParams();
  if (boardId) p.set('board', String(boardId));
  if (sort !== 'latest') p.set('sort', sort);
  const qs = p.toString();
  return qs ? `/?${qs}` : '/';
}

export function feedSortLabel(sort: FeedSort): string {
  return SORT_OPTIONS.find(o => o.key === sort)?.label ?? '帖子列表';
}

export default function FeedSortBar({ value, onChange, postTotal }: Props) {
  return (
    <div className="feed-toolbar">
      <div className="feed-sort-bar" role="tablist" aria-label="帖子排序">
        {SORT_OPTIONS.map(({ key, label, hint, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
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
