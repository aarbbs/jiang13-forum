import { useMemo, useState } from 'react';
import world from '@svg-maps/world';
import { cn } from '@/lib/utils';
import {
  buildCountMap,
  countryLabelZh,
  emptyFill,
  heatFill,
  type GeoCountMap,
} from './monitorMapUtils';

type Loc = { id: string; name: string; path: string };

type Props = {
  items: { country: string; count: number }[];
  className?: string;
  /** 裁切到东亚（中国模式） */
  focusChina?: boolean;
};

const CHINA_VIEWBOX = '680 260 220 200';

export default function MonitorWorldMap({ items, className, focusChina }: Props) {
  const [hover, setHover] = useState<{ code: string; name: string; count: number } | null>(null);

  const counts = useMemo(() => buildCountMap(items), [items]);
  const max = useMemo(() => Math.max(0, ...Object.values(counts)), [counts]);
  const hasData = max > 0;

  const locations = (world as { locations: Loc[]; viewBox: string }).locations;
  const viewBox = focusChina ? CHINA_VIEWBOX : (world as { viewBox: string }).viewBox;

  const filteredCounts: GeoCountMap = useMemo(() => {
    if (!focusChina) return counts;
    const allow = new Set(['CN', 'HK', 'MO', 'TW']);
    const m: GeoCountMap = {};
    for (const [k, v] of Object.entries(counts)) {
      if (allow.has(k)) m[k] = v;
    }
    return m;
  }, [counts, focusChina]);

  const focusMax = useMemo(
    () => Math.max(0, ...Object.values(filteredCounts)),
    [filteredCounts],
  );
  const focusHas = focusMax > 0;

  return (
    <div className={cn('admin-monitor-svg-wrap', className)}>
      <svg
        className="admin-monitor-svg-map"
        viewBox={viewBox}
        role="img"
        aria-label={focusChina ? '中国及周边访客地图' : '世界访客地图'}
      >
        {locations.map((loc) => {
          const code = loc.id.toUpperCase();
          if (focusChina) {
            // 中国模式下非本区域保持极淡灰，本区域按数据着色
            const inRegion = code === 'CN' || code === 'HK' || code === 'MO' || code === 'TW'
              || code === 'JP' || code === 'KR' || code === 'MN' || code === 'KP'
              || code === 'RU' || code === 'IN' || code === 'VN' || code === 'LA'
              || code === 'MM' || code === 'BT' || code === 'NP' || code === 'KZ'
              || code === 'KG' || code === 'TJ' || code === 'UZ' || code === 'AF'
              || code === 'PK' || code === 'PH' || code === 'MY' || code === 'TH'
              || code === 'KH' || code === 'BD' || code === 'LK';
            if (!inRegion) return null;
          }
          const count = filteredCounts[code] || (focusChina ? 0 : counts[code]) || 0;
          const useMax = focusChina ? focusMax : max;
          const useHas = focusChina ? focusHas : hasData;
          const isCore = !focusChina || code === 'CN' || code === 'HK' || code === 'MO' || code === 'TW';
          const fill = isCore
            ? heatFill(count, useMax, useHas)
            : emptyFill(useHas);

          return (
            <path
              key={loc.id}
              d={loc.path}
              data-code={code}
              fill={fill}
              stroke="hsl(var(--background, 0 0% 100%))"
              strokeWidth={focusChina ? 0.35 : 0.4}
              className={cn('admin-monitor-svg-path', count > 0 && 'has-data')}
              onMouseEnter={() => setHover({
                code,
                name: countryLabelZh(code, loc.name),
                count: focusChina && !isCore ? 0 : count,
              })}
              onMouseLeave={() => setHover(null)}
            >
              <title>
                {countryLabelZh(code, loc.name)}
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
      {!hasData && !focusChina && (
        <div className="admin-monitor-map-empty-overlay">
          <p>暂无国家数据</p>
          <p>配置 GeoIP 或 CDN 国家头后可见</p>
        </div>
      )}
      {focusChina && !focusHas && (
        <div className="admin-monitor-map-empty-overlay">
          <p>暂无中国地区访问数据</p>
        </div>
      )}
    </div>
  );
}
