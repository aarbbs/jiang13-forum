import { useEffect } from 'react';
import { formatDocumentTitle, getCachedSiteBranding, siteMetaDescription } from './useSiteBranding';

export interface PageSEO {
  /** 页面标题（不含站点名）；若提供 titleFull 则优先生效 */
  title?: string;
  /** 完整 document.title */
  titleFull?: string;
  description?: string;
  /** 覆盖站点默认 keywords；不传则用品牌配置 */
  keywords?: string;
  canonicalPath?: string;
  ogType?: string;
  ogImage?: string;
  /** 默认 index；私密页传 noindex,nofollow */
  robots?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/** 合并页面与站点关键词（逗号分隔） */
export function joinSEOKeywords(...parts: Array<string | undefined | null>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const raw of part.replace(/[，、;；]/g, ',').split(',')) {
      const p = raw.trim();
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out.join(',');
}

const SEO_ATTR = 'data-j13-seo';

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  const head = document.head;
  let el = head.querySelector<HTMLMetaElement>(selector);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  const head = document.head;
  let el = head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(data?: PageSEO['jsonLd']) {
  const id = 'j13-jsonld';
  document.getElementById(id)?.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function absoluteURL(pathOrURL: string): string {
  if (!pathOrURL) return '';
  if (/^https?:\/\//i.test(pathOrURL)) return pathOrURL;
  return new URL(pathOrURL, window.location.origin).href;
}

/** 客户端路由切换时同步 title / meta / JSON-LD（与服务端首屏注入互补） */
export function usePageSEO(seo: PageSEO | null | undefined) {
  const jsonLdKey = seo?.jsonLd ? JSON.stringify(seo.jsonLd) : '';

  useEffect(() => {
    if (!seo) return;

    const brand = getCachedSiteBranding();
    const siteName = brand.name.trim() || '姜十三论坛';
    const title = seo.titleFull?.trim()
      || (seo.title?.trim() ? `${seo.title.trim()} - ${siteName}` : formatDocumentTitle(brand));

    document.documentElement.setAttribute(SEO_ATTR, '1');
    document.title = title;

    const description = (seo.description ?? siteMetaDescription(brand)).trim();
    const keywords = (seo.keywords ?? brand.keywords ?? '').trim();
    const canonical = absoluteURL(seo.canonicalPath || window.location.pathname);
    const ogImage = absoluteURL(seo.ogImage || brand.og_image || brand.logo || brand.favicon || '');
    const ogType = seo.ogType || 'website';
    const robots = seo.robots || '';

    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertMeta('meta[name="keywords"]', 'name', 'keywords', keywords);
    upsertMeta('meta[name="robots"]', 'name', 'robots', robots);
    upsertLink('canonical', canonical);

    upsertMeta('meta[property="og:type"]', 'property', 'og:type', ogType);
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', siteName);
    upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', 'zh_CN');
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', ogImage);

    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', ogImage);

    upsertJsonLd(seo.jsonLd);

    return () => {
      document.documentElement.removeAttribute(SEO_ATTR);
      // 离开页面时恢复站点默认标题；具体 meta 由下一页 usePageSEO 覆盖
      document.title = formatDocumentTitle(getCachedSiteBranding());
      upsertJsonLd(undefined);
    };
    // jsonLd 以序列化字符串作为依赖，避免内联对象导致重复执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    seo?.title,
    seo?.titleFull,
    seo?.description,
    seo?.keywords,
    seo?.canonicalPath,
    seo?.ogType,
    seo?.ogImage,
    seo?.robots,
    jsonLdKey,
  ]);
}

/** 管理 / 登录等私密页一键 noindex */
export function useNoIndexSEO(title: string) {
  usePageSEO({
    title,
    robots: 'noindex,nofollow',
  });
}
