import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SiteBranding } from '../api/types';

export const DEFAULT_BRANDING: SiteBranding = {
  name: '姜十三论坛',
  slogan: '拾三一隅，自在交流',
  description: '',
  keywords: '',
  logo_mark: '姜',
  logo: '',
  favicon: '',
  og_image: '',
  icp_beian: '',
  icp_beian_url: 'https://beian.miit.gov.cn/',
  friend_links: [],
};

declare global {
  interface Window {
    /** 服务端注入的首屏品牌配置（见 embed_static SPA HTML） */
    __J13_BRANDING__?: Partial<SiteBranding>;
  }
}

/** SEO / 首页展示用简介：优先 description，其次 slogan */
export function siteMetaDescription(brand: SiteBranding): string {
  const d = brand.description?.trim() ?? '';
  if (d) return d;
  return brand.slogan?.trim() ?? '';
}

/** 从服务端注入的 boot 数据同步初始化，避免首屏闪默认站名 */
function readBootBranding(): SiteBranding | null {
  try {
    const boot = window.__J13_BRANDING__;
    if (!boot || typeof boot !== 'object') return null;
    const name = typeof boot.name === 'string' ? boot.name.trim() : '';
    if (!name) return null;
    return { ...DEFAULT_BRANDING, ...boot, name };
  } catch {
    return null;
  }
}

let cached: SiteBranding | null = readBootBranding();
let inflight: Promise<SiteBranding> | null = null;
let cacheEpoch = 0;
const listeners = new Set<() => void>();

function fetchBranding(): Promise<SiteBranding> {
  if (inflight) return inflight;
  // 有 boot/缓存时首屏已可用；仍请求 API 以同步最新配置
  inflight = api.siteBranding()
    .then(b => {
      cached = { ...DEFAULT_BRANDING, ...b };
      return cached;
    })
    .catch(() => cached ?? DEFAULT_BRANDING)
    .finally(() => { inflight = null; });
  return inflight;
}

/** 浏览器标签标题：站点名 - 副标题（标语） */
export function formatDocumentTitle(brand: SiteBranding): string {
  const name = brand.name.trim();
  const subtitle = brand.slogan.trim();
  return subtitle ? `${name} - ${subtitle}` : name;
}

function applyDocumentBrand(brand: SiteBranding) {
  // 页面级 SEO hook 已接管标题时，勿覆盖
  if (!document.documentElement.hasAttribute('data-j13-seo')) {
    const title = formatDocumentTitle(brand);
    if (document.title !== title) document.title = title;
  }

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

/** 同步读取已缓存的品牌配置（供 SEO 等非 hook 场景） */
export function getCachedSiteBranding(): SiteBranding {
  return cached ?? DEFAULT_BRANDING;
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

/** 保留当前画面，后台重拉品牌配置（下拉刷新等） */
export function refetchSiteBranding() {
  inflight = null;
  cacheEpoch += 1;
  listeners.forEach(fn => fn());
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
