import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TagCount } from '../api/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Props {
  tags: TagCount[];
  loading?: boolean;
  activeTag?: string;
}

type TagTone = 0 | 1 | 2 | 3 | 4 | 5;

/** 稳定哈希，让同一标签颜色固定 */
function hashTone(name: string): TagTone {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return (h % 6) as TagTone;
}

/** 权重档位 0–4，驱动字号与透明度 */
function weightTier(count: number, min: number, max: number): number {
  if (max <= min) return 2;
  const t = (count - min) / (max - min);
  return Math.min(4, Math.max(0, Math.round(t * 4)));
}

/**
 * 打散排序：热门标签穿插分布，避免「大标签全挤在顶上」。
 * 用名称哈希做次级键，视觉更像云而非排行榜。
 */
function layoutTags(tags: TagCount[]): TagCount[] {
  const ranked = [...tags].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
  const top = ranked.slice(0, Math.min(6, ranked.length));
  const rest = ranked.slice(top.length);
  const out: TagCount[] = [];
  let i = 0;
  let j = 0;
  while (i < top.length || j < rest.length) {
    if (j < rest.length) out.push(rest[j++]);
    if (i < top.length) out.push(top[i++]);
    if (j < rest.length) out.push(rest[j++]);
  }
  return out;
}

/** 右侧栏标签云：按热度缩放，色调错落 */
export default function TagCloud({ tags, loading = false, activeTag = '' }: Props) {
  const nav = useNavigate();

  const { items, min, max } = useMemo(() => {
    if (tags.length === 0) return { items: [] as TagCount[], min: 1, max: 1 };
    let lo = tags[0].count;
    let hi = tags[0].count;
    for (const t of tags) {
      if (t.count < lo) lo = t.count;
      if (t.count > hi) hi = t.count;
    }
    return { items: layoutTags(tags), min: lo, max: hi };
  }, [tags]);

  if (loading && tags.length === 0) {
    return (
      <div className="tag-cloud tag-cloud--skeleton" aria-busy="true" aria-label="标签加载中">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton
            key={i}
            className="skeleton--tag-cloud"
            style={{
              width: `${42 + (i % 5) * 16}px`,
              height: `${20 + (i % 3) * 4}px`,
            }}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="tag-cloud-empty">暂无标签</div>;
  }

  return (
    <div className="tag-cloud" role="list" aria-label="标签云">
      {items.map((tag, index) => {
        const active = activeTag.trim().toLowerCase() === tag.name.toLowerCase();
        const tier = weightTier(tag.count, min, max);
        const tone = hashTone(tag.name);
        return (
          <button
            key={tag.name}
            type="button"
            role="listitem"
            className={cn(
              'tag-cloud-item',
              `tag-cloud-item--w${tier}`,
              `tag-cloud-item--t${tone}`,
              `tag-cloud-item--r${index % 5}`,
              active && 'active',
            )}
            title={`${tag.name} · ${tag.count} 篇`}
            onClick={() => nav(active ? '/' : `/?tag=${encodeURIComponent(tag.name)}`)}
          >
            <span className="tag-cloud-item__name">{tag.name}</span>
            {tier >= 3 && <span className="tag-cloud-item__count">{tag.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
