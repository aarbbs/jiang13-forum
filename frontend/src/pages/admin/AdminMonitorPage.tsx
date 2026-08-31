import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { api } from '../../api/client';
import type {
  MonitorASNItem,
  MonitorCityItem,
  MonitorConfig,
  MonitorGeoResult,
  MonitorLogItem,
  MonitorOverview,
  MonitorRealtime,
  MonitorStatItem,
} from '../../api/types';
import { useAdminGuard } from '../../layouts/AdminLayout';
import { formatTime } from '../../utils/content';
import { invalidateForumLimitsCache } from '../../hooks/useForumLimits';
import MonitorWorldMap from '../../components/admin/MonitorWorldMap';
import MonitorChinaMap from '../../components/admin/MonitorChinaMap';
import { countryLabelZh } from '../../components/admin/monitorMapUtils';

type TabKey = 'overview' | 'stats' | 'logs' | 'settings';
type StatsDim = 'url' | 'referer' | 'browser' | 'os' | 'device' | 'status';
type StatsRange = '1d' | '7d' | '30d' | '90d';
type MapMode = 'world' | 'china';
type RankMode = 'city' | 'asn';

function countryLabel(code: string) {
  return countryLabelZh(code);
}

function formatBytes(n: number) {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n ?? 0);
}

function MiniSparkline({ series }: { series: { count: number }[] }) {
  const max = Math.max(1, ...series.map((p) => p.count));
  const w = 240;
  const h = 48;
  const pts = series.map((p, i) => {
    const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * w;
    const y = h - (p.count / max) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="admin-monitor-spark" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden>
      <polyline fill="none" stroke="var(--j13-green)" strokeWidth="2" points={pts} />
    </svg>
  );
}

const CHINA_CODES = new Set(['CN', 'HK', 'TW', 'MO']);

function geoCountries(geo: MonitorGeoResult | null) {
  return geo?.countries || [];
}

function GeoRankTable({
  cities,
  asns,
  mode,
  rankMode,
  onRankMode,
  hasCountryHits,
}: {
  cities: MonitorCityItem[];
  asns: MonitorASNItem[];
  mode: MapMode;
  rankMode: RankMode;
  onRankMode: (m: RankMode) => void;
  /** 近 30 日是否已有国家级浏览量（用于区分「无 PV 地理」与缺库） */
  hasCountryHits: boolean;
}) {
  const cityRows = mode === 'china'
    ? cities.filter((i) => CHINA_CODES.has((i.country || '').toUpperCase()))
    : cities;
  const rows = rankMode === 'city' ? cityRows : asns;
  const emptyHint = rankMode === 'city'
    ? (hasCountryHits
      ? '需前台路由产生带城市的浏览量；仅请求日志不会进入此排行。请确认已放置 IP2Location DB3 BIN。'
      : '需前台路由产生浏览量后才会有城市排行；仅请求日志不会点亮此处。')
    : (hasCountryHits
      ? '需浏览量写入 ASN；请确认已放置 GeoLite2-ASN.mmdb。仅请求日志不会进入此排行。'
      : '需前台路由产生浏览量后才会有运营商排行；仅请求日志不会点亮此处。');

  return (
    <div className="admin-monitor-rank">
      <div className="admin-monitor-seg" role="group" aria-label="排行维度">
        <button
          type="button"
          className={cn('admin-monitor-seg-btn', rankMode === 'city' && 'active')}
          onClick={() => onRankMode('city')}
        >
          城市
        </button>
        <button
          type="button"
          className={cn('admin-monitor-seg-btn', rankMode === 'asn' && 'active')}
          onClick={() => onRankMode('asn')}
        >
          运营商
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="admin-monitor-geo-empty">
          <p>暂无浏览量来源数据</p>
          <p className="admin-monitor-muted">{emptyHint}</p>
        </div>
      ) : (
        <table className="admin-monitor-geo-table">
          <thead>
            <tr>
              <th>{rankMode === 'city' ? '城市' : '运营商'}</th>
              <th>数量</th>
            </tr>
          </thead>
          <tbody>
            {rankMode === 'city'
              ? cityRows.slice(0, 12).map((item, idx) => (
                <tr key={`${item.country}-${item.city}-${idx}`}>
                  <td title={[item.region, item.city].filter(Boolean).join(' · ')}>
                    {item.city}
                    {item.region ? <span className="admin-monitor-muted"> · {item.region}</span> : null}
                  </td>
                  <td>{formatNum(item.count)}</td>
                </tr>
              ))
              : asns.slice(0, 12).map((item) => (
                <tr key={item.asn}>
                  <td title={item.as_org || `AS${item.asn}`}>
                    {item.as_org || `AS${item.asn}`}
                    <span className="admin-monitor-muted"> · AS{item.asn}</span>
                  </td>
                  <td>{formatNum(item.count)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function parseMonitorTab(raw: string | null): TabKey {
  if (raw === 'stats' || raw === 'logs' || raw === 'settings' || raw === 'overview') {
    return raw;
  }
  return 'overview';
}

export default function AdminMonitorPage() {
  const { ready } = useAdminGuard();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() => parseMonitorTab(searchParams.get('tab')));
  const [overview, setOverview] = useState<MonitorOverview | null>(null);
  const [geo, setGeo] = useState<MonitorGeoResult | null>(null);
  const [realtime, setRealtime] = useState<MonitorRealtime | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('world');
  const [rankMode, setRankMode] = useState<RankMode>('city');
  const [loading, setLoading] = useState(true);

  const [statsDim, setStatsDim] = useState<StatsDim>('url');
  const [statsRange, setStatsRange] = useState<StatsRange>('30d');
  const [statsItems, setStatsItems] = useState<MonitorStatItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const [logs, setLogs] = useState<MonitorLogItem[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logMethod, setLogMethod] = useState('');
  const [logPath, setLogPath] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [logIP, setLogIP] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  const [settings, setSettings] = useState<MonitorConfig | null>(null);
  const [excludeText, setExcludeText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = parseMonitorTab(searchParams.get('tab'));
    setTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  const selectTab = (key: TabKey) => {
    setTab(key);
    const next = new URLSearchParams(searchParams);
    if (key === 'overview') next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const loadOverview = useCallback(async () => {
    const [ov, g, rt] = await Promise.all([
      api.adminMonitorOverview(),
      api.adminMonitorGeo('30d'),
      api.adminMonitorRealtime(),
    ]);
    setOverview(ov);
    setGeo(g);
    setRealtime(rt);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    loadOverview()
      .catch(() => notify.error('加载监控概览失败'))
      .finally(() => setLoading(false));
  }, [ready, loadOverview]);

  // 概览页实时轮询
  useEffect(() => {
    if (!ready || tab !== 'overview') return;
    const id = window.setInterval(() => {
      api.adminMonitorRealtime().then(setRealtime).catch(() => {});
      api.adminMonitorOverview().then(setOverview).catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, [ready, tab]);

  useEffect(() => {
    if (!ready || tab !== 'stats') return;
    setStatsLoading(true);
    api.adminMonitorStats(statsDim, statsRange)
      .then((r) => setStatsItems(r.items || []))
      .catch(() => notify.error('加载统计失败'))
      .finally(() => setStatsLoading(false));
  }, [ready, tab, statsDim, statsRange]);

  const loadLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const r = await api.adminMonitorLogs({
        page,
        size: 20,
        method: logMethod || undefined,
        path: logPath || undefined,
        status: logStatus || undefined,
        ip: logIP || undefined,
      });
      setLogs(r.items || []);
      setLogsTotal(r.total || 0);
      setLogsPage(r.page || page);
    } catch {
      notify.error('加载请求日志失败');
    } finally {
      setLogsLoading(false);
    }
  }, [logMethod, logPath, logStatus, logIP]);

  useEffect(() => {
    if (!ready || tab !== 'logs') return;
    loadLogs(1);
  }, [ready, tab, loadLogs]);

  useEffect(() => {
    if (!ready || tab !== 'settings') return;
    api.adminMonitorSettings()
      .then((cfg) => {
        setSettings(cfg);
        setExcludeText((cfg.exclude_rules || []).join('\n'));
      })
      .catch(() => notify.error('加载设置失败'));
  }, [ready, tab]);

  const enabled = overview?.enabled ?? settings?.enabled ?? false;

  const metrics = useMemo(() => {
    if (!overview) return [];
    const pvHint = '前台浏览';
    const accessHintShort = '服务端请求';
    const accessHintFull = '服务端请求（含 API，重启后重计）';
    return [
      { label: '浏览量', hint: pvHint, title: pvHint, value: formatNum(overview.pageviews) },
      { label: '访客数', hint: pvHint, title: pvHint, value: formatNum(overview.visitors) },
      { label: '独立 IP', hint: accessHintShort, title: accessHintFull, value: formatNum(overview.unique_ips) },
      { label: '流量', hint: accessHintShort, title: accessHintFull, value: formatBytes(overview.traffic) },
      { label: '蜘蛛', hint: accessHintShort, title: accessHintFull, value: formatNum(overview.bots) },
      { label: '请求数', hint: accessHintShort, title: accessHintFull, value: formatNum(overview.requests) },
      { label: '4xx', hint: accessHintShort, title: accessHintFull, value: formatNum(overview.status_4xx) },
      { label: '5xx', hint: accessHintShort, title: accessHintFull, value: formatNum(overview.status_5xx) },
    ];
  }, [overview]);

  const hasCountryHits = (geo?.countries?.length || 0) > 0;
  const hasRegionHits = (geo?.regions?.length || 0) > 0;

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const rules = excludeText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const r = await api.adminUpdateMonitorSettings({
        ...settings,
        exclude_rules: rules,
      });
      setSettings(r.monitor);
      setExcludeText((r.monitor.exclude_rules || []).join('\n'));
      invalidateForumLimitsCache();
      notify.success(r.message);
      const ov = await api.adminMonitorOverview();
      setOverview(ov);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!ready || (loading && tab === 'overview')) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: '概览' },
    { key: 'stats', label: '访问统计' },
    { key: 'logs', label: '请求日志' },
    { key: 'settings', label: '设置' },
  ];

  const dims: { key: StatsDim; label: string }[] = [
    { key: 'url', label: 'URL' },
    { key: 'referer', label: '来源' },
    { key: 'browser', label: '浏览器' },
    { key: 'os', label: '系统' },
    { key: 'device', label: '设备' },
    { key: 'status', label: '状态码' },
  ];

  const ranges: { key: StatsRange; label: string }[] = [
    { key: '1d', label: '今日' },
    { key: '7d', label: '7 日' },
    { key: '30d', label: '30 日' },
    { key: '90d', label: '90 日' },
  ];

  return (
    <div className="admin-page admin-monitor-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">
            <Activity size={22} aria-hidden />
            网站监控
          </h1>
          <p className="admin-page-desc">
            浏览量/访客与访客地图来自前台路由 pageview；请求数、流量与请求日志来自服务端访问采集（含 /api，重启后请求类今日指标重计）
          </p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="监控分类">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={cn('admin-tab', tab === t.key && 'active')}
            onClick={() => selectTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!enabled && tab !== 'settings' && (
        <div className="admin-monitor-banner" role="status">
          <AlertTriangle size={16} aria-hidden />
          <span>访问采集尚未开启，指标可能为空。</span>
          <button type="button" className="admin-text-link" onClick={() => selectTab('settings')}>
            前往设置开启
          </button>
        </div>
      )}

      {tab === 'overview' && overview && (
        <>
          <section className="admin-card admin-monitor-today" aria-label="今日状态">
            <div className="admin-monitor-today-head">
              <span className="admin-monitor-section-bar" aria-hidden />
              <h2 className="admin-monitor-section-title">今日状态</h2>
            </div>
            <div className="admin-monitor-today-grid">
              {metrics.map((m) => (
                <div key={m.label} className="admin-monitor-today-item" title={m.title}>
                  <div className="admin-monitor-today-label">
                    {m.label}
                    <span className="admin-monitor-today-hint">{m.hint}</span>
                  </div>
                  <div className="admin-monitor-today-value">{m.value}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="admin-monitor-main">
            <section className="admin-card admin-monitor-map-panel">
              <div className="admin-card-head admin-monitor-map-head">
                <div className="admin-monitor-today-head" style={{ marginBottom: 0 }}>
                  <span className="admin-monitor-section-bar" aria-hidden />
                  <div>
                    <h2 className="admin-monitor-section-title">访客地图</h2>
                    <p className="admin-monitor-map-sub">
                      基于前台浏览 · 近 30 日
                      {mapMode === 'china' ? ' · 按省/区填色' : ' · 按国家填色'}
                    </p>
                  </div>
                </div>
                <div className="admin-monitor-seg" role="group" aria-label="地图范围">
                  <button
                    type="button"
                    className={cn('admin-monitor-seg-btn', mapMode === 'world' && 'active')}
                    onClick={() => setMapMode('world')}
                  >
                    世界
                  </button>
                  <button
                    type="button"
                    className={cn('admin-monitor-seg-btn', mapMode === 'china' && 'active')}
                    onClick={() => setMapMode('china')}
                  >
                    中国
                  </button>
                </div>
              </div>
              <div className="admin-card-body admin-monitor-map-body">
                <div className="admin-monitor-map-visual">
                  {mapMode === 'world' ? (
                    <MonitorWorldMap items={geoCountries(geo)} />
                  ) : (
                    <MonitorChinaMap
                      regions={geo?.regions || []}
                      hasCountryHits={hasCountryHits}
                      hasRegionHits={hasRegionHits}
                    />
                  )}
                </div>
                <div className="admin-monitor-map-side">
                  <GeoRankTable
                    cities={geo?.cities || []}
                    asns={geo?.asns || []}
                    mode={mapMode}
                    rankMode={rankMode}
                    onRankMode={setRankMode}
                    hasCountryHits={hasCountryHits}
                  />
                </div>
              </div>
            </section>

            <div className="admin-monitor-rt-stack">
              <section className="admin-card admin-monitor-rt-card">
                <div className="admin-monitor-today-head">
                  <span className="admin-monitor-section-bar" aria-hidden />
                  <h2 className="admin-monitor-section-title">实时请求数（1 分钟）</h2>
                </div>
                <div className="admin-monitor-rt-value">{formatNum(realtime?.requests_1m || 0)}</div>
              </section>
              <section className="admin-card admin-monitor-rt-card">
                <div className="admin-monitor-today-head">
                  <span className="admin-monitor-section-bar" aria-hidden />
                  <h2 className="admin-monitor-section-title">实时流量（1 分钟）</h2>
                </div>
                <div className="admin-monitor-rt-value">{formatBytes(realtime?.traffic_1m || 0)}</div>
                <p className="admin-monitor-muted admin-monitor-rt-spark-label">近 1 小时请求</p>
                <MiniSparkline series={realtime?.hourly_series || []} />
              </section>
            </div>
          </div>
        </>
      )}

      {tab === 'stats' && (
        <div className="admin-card">
          <div className="admin-card-head">
            <div className="admin-tabs" style={{ marginBottom: 0 }}>
              {dims.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={cn('admin-tab', statsDim === d.key && 'active')}
                  onClick={() => setStatsDim(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="admin-tabs" style={{ marginBottom: 0 }}>
              {ranges.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={cn('admin-tab', statsRange === r.key && 'active')}
                  onClick={() => setStatsRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="admin-card-body" style={{ padding: 0 }}>
            {statsLoading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : statsItems.length === 0 ? (
              <p className="admin-empty">暂无统计数据</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>#</th>
                      <th>名称</th>
                      <th style={{ width: 100 }}>数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsItems.map((item, idx) => (
                      <tr key={`${item.key}-${idx}`}>
                        <td>{idx + 1}</td>
                        <td className="admin-table-mono" title={item.key}>{item.key}</td>
                        <td>{formatNum(item.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="admin-card">
          <div className="admin-form-row admin-monitor-log-filters">
            <Input value={logMethod} onChange={(e) => setLogMethod(e.target.value)} placeholder="方法 GET" aria-label="方法" style={{ width: 100 }} />
            <Input value={logPath} onChange={(e) => setLogPath(e.target.value)} placeholder="路径包含…" aria-label="路径" />
            <Input value={logStatus} onChange={(e) => setLogStatus(e.target.value)} placeholder="状态码" aria-label="状态码" style={{ width: 90 }} />
            <Input value={logIP} onChange={(e) => setLogIP(e.target.value)} placeholder="IP 包含…" aria-label="IP" style={{ width: 140 }} />
            <Button type="button" variant="outline" onClick={() => loadLogs(1)}>筛选</Button>
          </div>
          <div className="admin-card-body" style={{ padding: 0 }}>
            {logsLoading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : logs.length === 0 ? (
              <p className="admin-empty">暂无请求日志</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>方法</th>
                      <th>路径</th>
                      <th>状态</th>
                      <th>IP</th>
                      <th>耗时</th>
                      <th>地区</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((row) => {
                      const placeBits = [row.region, row.city, row.as_org].filter(Boolean);
                      const geoBits = [
                        row.country ? countryLabel(row.country) : '',
                        ...placeBits,
                      ].filter(Boolean);
                      return (
                        <tr key={row.id}>
                          <td>{formatTime(row.created_at)}</td>
                          <td>{row.method}</td>
                          <td className="admin-table-mono" title={row.path}>{row.path}</td>
                          <td>{row.status}</td>
                          <td className="admin-table-mono">
                            {row.ip || '—'}
                            {row.is_bot ? ' · bot' : ''}
                            {placeBits.length > 0 ? (
                              <div className="admin-monitor-muted" style={{ fontSize: 12 }}>
                                {placeBits.join(' · ')}
                              </div>
                            ) : null}
                          </td>
                          <td>{row.duration_ms}ms</td>
                          <td title={geoBits.join(' · ')}>{row.country ? countryLabel(row.country) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {logsTotal > 20 && (
              <div className="admin-form-row" style={{ justifyContent: 'flex-end' }}>
                <Button type="button" variant="outline" disabled={logsPage <= 1} onClick={() => loadLogs(logsPage - 1)}>上一页</Button>
                <span className="admin-monitor-muted">第 {logsPage} 页 / 共 {logsTotal} 条</span>
                <Button type="button" variant="outline" disabled={logsPage * 20 >= logsTotal} onClick={() => loadLogs(logsPage + 1)}>下一页</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && settings && (
        <div className="admin-card admin-settings-card">
          <div className="admin-card-head">采集设置</div>
          <div className="admin-card-body admin-monitor-settings">
            <label className="admin-monitor-switch-row">
              <div>
                <strong>启用访问采集</strong>
                <p className="admin-monitor-muted">
                  默认关闭。开启后：前台路由上报浏览量/访客；服务端记录请求日志与请求数（含 API）。后台与登录页不上报 pageview。
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
              />
            </label>

            <label className="admin-monitor-field">
              <span>浏览量保留天数（独立 monitor.db，1–365）</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={settings.retention_days}
                onChange={(e) => setSettings({ ...settings, retention_days: Number(e.target.value) || 30 })}
              />
            </label>

            <label className="admin-monitor-field">
              <span>请求日志保留天数（JSONL，1–365）</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={settings.access_log_retention_days ?? 7}
                onChange={(e) => setSettings({ ...settings, access_log_retention_days: Number(e.target.value) || 7 })}
              />
            </label>

            <label className="admin-monitor-switch-row">
              <div>
                <strong>信任代理头</strong>
                <p className="admin-monitor-muted">从 X-Forwarded-For / CF-Connecting-IP 等读取真实 IP</p>
              </div>
              <Switch
                checked={settings.trust_proxy}
                onCheckedChange={(v) => setSettings({ ...settings, trust_proxy: v })}
              />
            </label>

            <label className="admin-monitor-field">
              <span>排除规则（每行一条：路径前缀或扩展名如 .js）</span>
              <textarea
                className="admin-monitor-textarea"
                rows={8}
                value={excludeText}
                onChange={(e) => setExcludeText(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                style={{ marginTop: 8 }}
                onClick={() => setExcludeText((settings.default_exclude_rules || []).join('\n'))}
              >
                恢复推荐排除规则
              </Button>
            </label>

            <div className="admin-monitor-geo-note">
              <strong>GeoIP（地理与运营商）</strong>
              <p className="admin-monitor-muted">
                国家/省/市由 IP2Location DB3 BIN 解析；ASN 由 GeoLite2-ASN.mmdb 解析（Docker 镜像不内置，需放入数据目录）：
              </p>
              <ul className="admin-monitor-muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                <li>
                  IPv4 BIN：<code>{settings.ip2location_v4_path || 'data/IP2LOCATION-LITE-DB3.BIN'}</code>
                  {' · '}{settings.ip2location_v4_available ? '已加载' : '未检测到'}
                </li>
                <li>
                  IPv6 BIN：<code>{settings.ip2location_v6_path || 'data/IP2LOCATION-LITE-DB3.IPV6.BIN'}</code>
                  {' · '}{settings.ip2location_v6_available ? '已加载' : '未检测到'}
                </li>
                <li>
                  ASN：<code>{settings.geoip_asn_path || 'data/GeoLite2-ASN.mmdb'}</code>
                  {' · '}{settings.geoip_asn_available ? '已加载' : '未检测到'}
                </li>
                <li>
                  Country 兜底：<code>{settings.geoip_country_path || 'data/GeoLite2-Country.mmdb'}</code>
                  {' · '}{settings.geoip_country_available ? '已加载' : '未检测到（可选）'}
                </li>
              </ul>
              <p className="admin-monitor-muted" style={{ marginTop: 8 }}>
                请求日志目录：<code>{settings.access_log_dir || 'data/logs/access'}</code>
                （按日 JSONL 文件，删除过期文件即可释放磁盘）
              </p>
              <p className="admin-monitor-muted" style={{ marginTop: 8 }}>
                CDN 国家头（如 CF-IPCountry）仅在本地库无国家码时补全。管理端展示完整客户端 IP。
              </p>
            </div>

            <div style={{ marginTop: 16 }}>
              <Button type="button" onClick={saveSettings} disabled={saving}>
                {saving ? '保存中…' : '保存设置'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
