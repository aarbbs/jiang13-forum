import { useEffect, useState } from 'react';
import { ExternalLink, Globe2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { api } from '../api/client';
import type { CommunityShowcaseItem } from '../api/types';
import { joinSEOKeywords, usePageSEO } from '../hooks/usePageSEO';
import { getCachedSiteBranding, useSiteBranding } from '../hooks/useSiteBranding';
import { InFlowSiteFooter } from '../components/SiteFooter';

/** 官方精选的公网部署展柜（只读；仅人工精选条目） */
export default function ShowcasePage() {
  const { branding } = useSiteBranding();
  const [items, setItems] = useState<CommunityShowcaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  usePageSEO({
    title: '开源部署展柜',
    description: `${branding.name} 精选的姜十三论坛公网部署`,
    keywords: joinSEOKeywords('开源', '部署', '展柜', getCachedSiteBranding().keywords),
    canonicalPath: '/showcase',
  });

  useEffect(() => {
    let cancelled = false;
    api.communityShowcase()
      .then((r) => {
        if (!cancelled) setItems(Array.isArray(r.items) ? r.items : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="showcase-page">
      <header className="showcase-head">
        <div className="showcase-head-mark" aria-hidden>
          <Globe2 size={22} />
        </div>
        <div>
          <h1 className="showcase-title">开源部署展柜</h1>
          <p className="showcase-desc">
            以下站点自愿开启社区上报，并由官方演示站精选推荐（非全量目录）
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <p className="showcase-empty">暂无精选实例</p>
      ) : (
        <ul className="showcase-list">
          {items.map((item) => (
            <li key={item.site_url} className="showcase-item">
              <a
                href={item.site_url}
                target="_blank"
                rel="noopener noreferrer"
                className="showcase-item-link"
              >
                <span className="showcase-item-name">{item.site_name || '未命名站点'}</span>
                <span className="showcase-item-url">
                  {item.site_url}
                  <ExternalLink size={12} aria-hidden />
                </span>
                {(item.featured_note || item.version) && (
                  <span className="showcase-item-meta">
                    {item.featured_note || null}
                    {item.featured_note && item.version ? ' · ' : null}
                    {item.version ? `v${item.version}` : null}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}

      <InFlowSiteFooter />
    </div>
  );
}
