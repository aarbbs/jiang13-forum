import { useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { CommunityShowcaseItem } from '../api/types';

/** 右侧栏：开源展柜精简列表 */
export default function ShowcaseAsideWidget() {
  const nav = useNavigate();
  const [items, setItems] = useState<CommunityShowcaseItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="widget-card widget-card--showcase">
      <div className="widget-card-head widget-card-head--split">
        <span className="widget-card-head-main">
          <Globe2 className="widget-card-icon widget-card-icon--showcase" aria-hidden />
          <button type="button" className="widget-friend-links-title" onClick={() => nav('/showcase')}>
            开源展柜
          </button>
        </span>
        <button type="button" className="widget-friend-links-more" onClick={() => nav('/showcase')}>
          全部
        </button>
      </div>
      <div className="widget-card-body widget-card-body--friend-links">
        {loading ? (
          <div className="widget-empty">加载中…</div>
        ) : items.length === 0 ? (
          <div className="widget-empty">
            暂无精选实例
            <button type="button" className="widget-friend-links-more" onClick={() => nav('/showcase')}>
              查看展柜
            </button>
          </div>
        ) : (
          <>
            <ul className="widget-friend-links-list">
              {items.slice(0, 8).map((item) => (
                <li key={item.site_url}>
                  <a href={item.site_url} target="_blank" rel="noopener noreferrer" title={item.site_name || item.site_url}>
                    {item.site_name || '未命名站点'}
                  </a>
                </li>
              ))}
            </ul>
            {items.length > 8 && (
              <button type="button" className="widget-friend-links-more" onClick={() => nav('/showcase')}>
                查看全部 {items.length} 个
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
