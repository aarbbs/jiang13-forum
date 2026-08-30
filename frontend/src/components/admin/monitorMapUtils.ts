/** 监控地图共用：国家码 → 数量色阶（本站绿色） */

export type GeoCountMap = Record<string, number>;

const EMPTY = 'var(--j13-border, #e5e7eb)';
const BASE = 'hsl(var(--muted, 210 20% 94%))';

/** 由浅到深的绿色阶 */
const GREEN_STEPS = [
  'color-mix(in srgb, var(--j13-green) 28%, hsl(var(--card)))',
  'color-mix(in srgb, var(--j13-green) 45%, hsl(var(--card)))',
  'color-mix(in srgb, var(--j13-green) 62%, hsl(var(--card)))',
  'color-mix(in srgb, var(--j13-green) 80%, hsl(var(--card)))',
  'var(--j13-green)',
];

export function buildCountMap(items: { country: string; count: number }[]): GeoCountMap {
  const m: GeoCountMap = {};
  for (const it of items) {
    const code = (it.country || '').toUpperCase();
    if (!code) continue;
    m[code] = (m[code] || 0) + it.count;
  }
  return m;
}

/** MaxMind region_iso / 中英文省名 → @svg-maps/china 的 location id */
const CN_ISO_TO_SVG: Record<string, string> = {
  AH: 'anhui', BJ: 'beijing', CQ: 'chongqing', FJ: 'fujian', GS: 'gansu',
  GD: 'guangdong', GX: 'guangxi-zhuang', GZ: 'guizhou', HI: 'hainan', HE: 'hebei',
  HL: 'heilongjiang', HA: 'henan', HB: 'hubei', HN: 'hunan', JS: 'jiangsu',
  JX: 'jiangxi', JL: 'jilin', LN: 'liaoning', NM: 'nei-mongol', NX: 'ningxia-hui',
  QH: 'quinghai', SN: 'shaanxi', SD: 'shandong', SH: 'shanghai', SX: 'shanxi',
  SC: 'sichuan', TJ: 'tianjin', XJ: 'xinjiang-uygur', XZ: 'xizang', YN: 'yunnan',
  ZJ: 'zhejiang', HK: 'hong-kong', MO: 'macau',
};

const CN_NAME_TO_SVG: Record<string, string> = {
  安徽: 'anhui', anhui: 'anhui',
  北京: 'beijing', beijing: 'beijing',
  重庆: 'chongqing', chongqing: 'chongqing',
  福建: 'fujian', fujian: 'fujian',
  甘肃: 'gansu', gansu: 'gansu',
  广东: 'guangdong', guangdong: 'guangdong',
  广西: 'guangxi-zhuang', '广西壮族自治区': 'guangxi-zhuang', 'guangxi zhuang': 'guangxi-zhuang', guangxi: 'guangxi-zhuang',
  贵州: 'guizhou', guizhou: 'guizhou',
  海南: 'hainan', hainan: 'hainan',
  河北: 'hebei', hebei: 'hebei',
  黑龙江: 'heilongjiang', heilongjiang: 'heilongjiang',
  河南: 'henan', henan: 'henan',
  湖北: 'hubei', hubei: 'hubei',
  湖南: 'hunan', hunan: 'hunan',
  江苏: 'jiangsu', jiangsu: 'jiangsu',
  江西: 'jiangxi', jiangxi: 'jiangxi',
  吉林: 'jilin', jilin: 'jilin',
  辽宁: 'liaoning', liaoning: 'liaoning',
  内蒙古: 'nei-mongol', '内蒙古自治区': 'nei-mongol', 'nei mongol': 'nei-mongol', 'inner mongolia': 'nei-mongol',
  宁夏: 'ningxia-hui', '宁夏回族自治区': 'ningxia-hui', 'ningxia hui': 'ningxia-hui', ningxia: 'ningxia-hui',
  青海: 'quinghai', qinghai: 'quinghai', quinghai: 'quinghai',
  陕西: 'shaanxi', shaanxi: 'shaanxi',
  山东: 'shandong', shandong: 'shandong',
  上海: 'shanghai', shanghai: 'shanghai',
  山西: 'shanxi', shanxi: 'shanxi',
  四川: 'sichuan', sichuan: 'sichuan',
  天津: 'tianjin', tianjin: 'tianjin',
  新疆: 'xinjiang-uygur', '新疆维吾尔自治区': 'xinjiang-uygur', 'xinjiang uygur': 'xinjiang-uygur', xinjiang: 'xinjiang-uygur',
  西藏: 'xizang', '西藏自治区': 'xizang', xizang: 'xizang', tibet: 'xizang',
  云南: 'yunnan', yunnan: 'yunnan',
  浙江: 'zhejiang', zhejiang: 'zhejiang',
  香港: 'hong-kong', 'hong kong': 'hong-kong',
  澳门: 'macau', macau: 'macau', macao: 'macau',
};

export function chinaRegionToSvgId(regionISO?: string, regionName?: string): string | null {
  const iso = (regionISO || '').trim().toUpperCase().replace(/^CN-/, '');
  if (iso && CN_ISO_TO_SVG[iso]) return CN_ISO_TO_SVG[iso];
  const name = (regionName || '').trim().toLowerCase();
  if (!name) return null;
  if (CN_NAME_TO_SVG[name]) return CN_NAME_TO_SVG[name];
  // 尝试去掉「省/市/自治区」后缀后再匹配中文键
  const zh = (regionName || '').trim()
    .replace(/(壮族|回族|维吾尔)?自治区$/, '')
    .replace(/(省|市)$/, '');
  if (CN_NAME_TO_SVG[zh]) return CN_NAME_TO_SVG[zh];
  return null;
}

/** 将省级统计聚合为 svg-maps/china 的 id → count */
export function buildChinaRegionCountMap(
  regions: { country: string; region?: string; region_iso?: string; count: number }[],
): GeoCountMap {
  const m: GeoCountMap = {};
  for (const it of regions) {
    const c = (it.country || '').toUpperCase();
    if (c && c !== 'CN' && c !== 'HK' && c !== 'MO' && c !== 'TW') continue;
    const id = chinaRegionToSvgId(it.region_iso, it.region);
    if (!id) continue;
    m[id] = (m[id] || 0) + it.count;
  }
  return m;
}

export function heatFill(count: number, max: number, hasAnyData: boolean): string {
  if (!hasAnyData) return BASE;
  if (!count || max <= 0) return BASE;
  const t = Math.log1p(count) / Math.log1p(max);
  const idx = Math.min(GREEN_STEPS.length - 1, Math.floor(t * GREEN_STEPS.length));
  return GREEN_STEPS[Math.max(0, idx)];
}

export function emptyFill(hasAnyData: boolean): string {
  return hasAnyData ? BASE : EMPTY;
}

export const COUNTRY_NAMES_ZH: Record<string, string> = {
  CN: '中国', US: '美国', JP: '日本', KR: '韩国', HK: '中国香港', TW: '中国台湾', MO: '中国澳门',
  SG: '新加坡', DE: '德国', GB: '英国', FR: '法国', RU: '俄罗斯', AU: '澳大利亚',
  CA: '加拿大', IN: '印度', BR: '巴西', NL: '荷兰', IT: '意大利', ES: '西班牙',
  MY: '马来西亚', TH: '泰国', VN: '越南', ID: '印尼', PH: '菲律宾', MX: '墨西哥',
  TR: '土耳其', SA: '沙特', AE: '阿联酋', ZA: '南非', NZ: '新西兰', SE: '瑞典',
  NO: '挪威', FI: '芬兰', DK: '丹麦', PL: '波兰', CH: '瑞士', AT: '奥地利',
  BE: '比利时', IE: '爱尔兰', PT: '葡萄牙', AR: '阿根廷', CL: '智利', CO: '哥伦比亚',
  PK: '巴基斯坦', BD: '孟加拉', EG: '埃及', NG: '尼日利亚', KE: '肯尼亚',
  UA: '乌克兰', CZ: '捷克', RO: '罗马尼亚', HU: '匈牙利', GR: '希腊', IL: '以色列',
};

export function countryLabelZh(code: string, fallbackName?: string) {
  const c = code.toUpperCase();
  return COUNTRY_NAMES_ZH[c] || fallbackName || c;
}
