import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SitePageSummary } from '../api/types';

let cache: SitePageSummary[] | null = null;
let pending: Promise<SitePageSummary[]> | null = null;

/** 已发布单页摘要（页脚/侧栏导航） */
export function useSitePages() {
  const [pages, setPages] = useState<SitePageSummary[]>(cache ?? []);

  useEffect(() => {
    if (cache) {
      setPages(cache);
      return;
    }
    if (!pending) {
      pending = api.pages()
        .then(d => {
          cache = d.pages ?? [];
          return cache;
        })
        .catch(() => {
          cache = [];
          return cache;
        })
        .finally(() => { pending = null; });
    }
    pending.then(setPages);
  }, []);

  return {
    pages,
    footerPages: pages.filter(p => p.show_in_footer),
    navPages: pages.filter(p => p.show_in_nav),
  };
}

export function invalidateSitePagesCache() {
  cache = null;
}
