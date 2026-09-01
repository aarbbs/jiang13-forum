import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api } from '../api/client';
import type { CommunityShowcaseItem } from '../api/types';
import { joinSEOKeywords, usePageSEO } from '../hooks/usePageSEO';
import { getCachedSiteBranding, useSiteBranding } from '../hooks/useSiteBranding';
import { InFlowSiteFooter } from '../components/SiteFooter';
import { useSessionResource } from '../hooks/useSessionResource';

function siteMark(name: string, url: string): string {
  const raw = (name || '').trim() || url.replace(/^https?:\/\//i, '');
  const ch = Array.from(raw)[0];
  return ch ? ch.toUpperCase() : '?';
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//i, '');
  }
}

/** 目标站约定路径 /favicon.ico */
function faviconURL(siteURL: string): string | null {
  try {
    return new URL('/favicon.ico', siteURL).href;
  } catch {
    return null;
  }
}

function ShowcaseFavicon({ name, url }: { name: string; url: string }) {
  const src = faviconURL(url);
  const [failed, setFailed] = useState(!src);
  const mark = siteMark(name, url);

  if (failed || !src) {
    return (
      <span className="showcase-item-mark" aria-hidden>
        {mark}
      </span>
    );
  }

  return (
    <span className="showcase-item-favicon">
      <img
        src={src}
        alt=""
        width={40}
        height={40}
        referrerPolicy="no-referrer"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/** 官方精选的公网部署展柜（只读；仅人工精选条目） */
export default function ShowcasePage() {
  const nav = useNavigate();
  const { branding } = useSiteBranding();
  const { data: items = [], loading } = useSessionResource<CommunityShowcaseItem[]>(
    'showcase',
    () => api.communityShowcase().then((r) => (Array.isArray(r.items) ? r.items : [])),
    { revalidateEmpty: true },
  );

  usePageSEO({
    title: '开源部署展柜',
    description: `${branding.name} 精选的姜十三论坛公网部署`,
    keywords: joinSEOKeywords('开源', '部署', '展柜', getCachedSiteBranding().keywords),
    canonicalPath: '/showcase',
  });

  return (
    <div className="page-wrap">
      <div className="feed-panel list-page-panel showcase-panel">
        <header className="list-page-panel__head showcase-head">
          <Button variant="ghost" size="sm" className="list-page-panel__back" onClick={() => nav('/')}>
            <ArrowLeft />
            返回
          </Button>
          <div className="showcase-head__title-row">
            <h1 className="page-title">开源部署展柜</h1>
            {!loading && items.length > 0 && (
              <span className="showcase-head__count">精选 {items.length} 站</span>
            )}
          </div>
          <p className="page-desc">
            以下站点自愿开启社区上报，并由官方演示站精选推荐（非全量目录）
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : items.length === 0 ? (
          <div className="showcase-empty list-page-panel__empty">
            <Globe2 size={28} strokeWidth={1.5} aria-hidden />
            <p>暂无精选实例</p>
            <span>有站点被官方推荐后会出现在这里</span>
          </div>
        ) : (
          <ul className="showcase-list">
            {items.map((item) => {
              const name = item.site_name || '未命名站点';
              return (
                <li key={item.site_url} className="showcase-item">
                  <a
                    href={item.site_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="showcase-item-link"
                  >
                    <ShowcaseFavicon name={name} url={item.site_url} />
                    <span className="showcase-item-body">
                      <span className="showcase-item-name">{name}</span>
                      <span className="showcase-item-url">
                        {hostLabel(item.site_url)}
                        <ExternalLink size={12} aria-hidden />
                      </span>
                      {item.featured_note ? (
                        <span className="showcase-item-note">{item.featured_note}</span>
                      ) : null}
                    </span>
                    {item.version ? (
                      <span className="showcase-item-version">v{item.version}</span>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        <InFlowSiteFooter />
      </div>
    </div>
  );
}
