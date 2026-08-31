import { useMemo, useState } from 'react';
import china from '@svg-maps/china';
import { cn } from '@/lib/utils';
import { buildChinaRegionCountMap, heatFill } from './monitorMapUtils';

type Loc = { id: string; name: string; path: string };

type RegionStat = {
  country: string;
  region?: string;
  region_iso?: string;
  count: number;
};

type Props = {
  regions: RegionStat[];
  className?: string;
  /** 近 30 日是否已有国家级浏览量 */
  hasCountryHits?: boolean;
  /** 近 30 日是否已有省级浏览量 */
  hasRegionHits?: boolean;
};

/** 中国省区地图：按 BIN 解析出的省/区填色 */
export default function MonitorChinaMap({
  regions,
  className,
  hasCountryHits = false,
  hasRegionHits = false,
}: Props) {
  const [hover, setHover] = useState<{ name: string; count: number } | null>(null);
  const counts = useMemo(() => buildChinaRegionCountMap(regions), [regions]);
  const max = useMemo(() => Math.max(0, ...Object.values(counts)), [counts]);
  const hasData = max > 0;
  const locations = (china as { locations: Loc[]; viewBox: string }).locations;
  const viewBox = (china as { viewBox: string }).viewBox;

  let emptyTitle = '暂无省级访问数据';
  let emptyHint = '放置 IP2LOCATION-LITE-DB3.BIN 后按省/区填色';
  if (hasCountryHits && !hasRegionHits) {
    emptyTitle = '有国家浏览量，尚无省级数据';
    emptyHint = '需前台路由产生带省字段的浏览量；仅请求日志不会点亮中国地图。请确认已放置 IP2Location DB3 BIN。';
  } else if (!hasCountryHits) {
    emptyTitle = '暂无浏览量地理数据';
    emptyHint = '需前台路由产生浏览量后才会按省填色；仅请求日志不会点亮此处。';
  }

  return (
    <div className={cn('admin-monitor-svg-wrap', className)}>
      <svg
        className="admin-monitor-svg-map"
        viewBox={viewBox}
        role="img"
        aria-label="中国访客地图"
      >
        {locations.map((loc) => {
          const count = counts[loc.id] || 0;
          return (
            <path
              key={loc.id}
              d={loc.path}
              fill={heatFill(count, max, hasData)}
              stroke="hsl(var(--background, 0 0% 100%))"
              strokeWidth={0.6}
              className={cn('admin-monitor-svg-path', count > 0 && 'has-data')}
              onMouseEnter={() => setHover({ name: loc.name, count })}
              onMouseLeave={() => setHover(null)}
            >
              <title>
                {loc.name}
                {count > 0 ? ` · ${count}` : ''}
              </title>
            </path>
          );
        })}
      </svg>
      {hover && (
        <div className="admin-monitor-map-tip" role="status">
          <strong>{hover.name}</strong>
          <span>{hover.count > 0 ? hover.count : '—'}</span>
        </div>
      )}
      {!hasData && (
        <div className="admin-monitor-map-empty-overlay">
          <p>{emptyTitle}</p>
          <p>{emptyHint}</p>
        </div>
      )}
    </div>
  );
}
