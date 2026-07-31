import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SiteBranding } from '../api/types';

export const DEFAULT_BRANDING: SiteBranding = {
  name: '姜十三论坛',
  name_en: 'Jiang13 Forum',
  slogan: '拾三一隅，自在交流',
  logo_mark: '姜',
  logo: '',
  favicon: '',
};

let cached: SiteBranding | null = null;
let inflight: Promise<SiteBranding> | null = null;
let cacheEpoch = 0;
const listeners = new Set<() => void>();

function fetchBranding(): Promise<SiteBranding> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = api.siteBranding()
    .then(b => {
      cached = { ...DEFAULT_BRANDING, ...b };
      return cached;
    })
    .catch(() => cached ?? DEFAULT_BRANDING)
    .finally(() => { inflight = null; });
  return inflight;
}

function applyDocumentBrand(brand: SiteBranding) {
  const title = brand.name_en ? `${brand.name} ${brand.name_en}` : brand.name;
  if (document.title !== title) document.title = title;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (brand.favicon) {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (link.href !== new URL(brand.favicon, window.location.origin).href) {
      link.href = brand.favicon;
    }
  }
}

/** 获取站点品牌配置（名称、Logo 等） */
export function useSiteBranding() {
  const [branding, setBranding] = useState<SiteBranding>(cached ?? DEFAULT_BRANDING);
  const [loading, setLoading] = useState(!cached);
  const [epoch, setEpoch] = useState(cacheEpoch);

  useEffect(() => {
    const onInvalidate = () => setEpoch(cacheEpoch);
    listeners.add(onInvalidate);
    return () => { listeners.delete(onInvalidate); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!cached) setLoading(true);
    fetchBranding()
      .then(next => {
        if (cancelled) return;
        setBranding(next);
        applyDocumentBrand(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [epoch]);

  return { branding, loading };
}

/** 清除缓存并通知已挂载的 hook 重新拉取 */
export function invalidateSiteBrandingCache() {
  cached = null;
  cacheEpoch += 1;
  listeners.forEach(fn => fn());
}

/** 用管理端刚保存的值立即更新缓存与文档标题 */
export function seedSiteBrandingCache(brand: SiteBranding) {
  cached = { ...DEFAULT_BRANDING, ...brand };
  applyDocumentBrand(cached);
  cacheEpoch += 1;
  listeners.forEach(fn => fn());
}
