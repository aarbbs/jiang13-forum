import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SitePageSummary } from '../api/types';
import { PAGE_FORCE_REFRESH_EVENT } from '../utils/feedCache';
import { PAGE_SOFT_REFRESH_COMMIT_EVENT } from '../utils/softRefresh';

let cache: SitePageSummary[] | null = null;
let pending: Promise<SitePageSummary[]> | null = null;

/** 拉取或复用站点页摘要缓存（供冷启动门闩与 hook 共用） */
export function ensureSitePagesLoaded(opts?: { force?: boolean }): Promise<SitePageSummary[]> {
  if (opts?.force) {
    cache = null;
    pending = null;
  }
  if (cache) return Promise.resolve(cache);
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
  return pending;
}

/** 已发布单页摘要（页脚/侧栏导航） */
export function useSitePages() {
  const [pages, setPages] = useState<SitePageSummary[]>(cache ?? []);

  useEffect(() => {
    const load = () => {
      void ensureSitePagesLoaded().then(setPages);
    };
    if (cache) setPages(cache);
    else load();

    const onForce = () => {
      cache = null;
      pending = null;
      load();
    };
    const onCommit = () => {
      // 软刷新：cache 已由 prefetch 写好，同步进 state
      void ensureSitePagesLoaded().then(setPages);
    };
    window.addEventListener(PAGE_FORCE_REFRESH_EVENT, onForce);
    window.addEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, onCommit);
    return () => {
      window.removeEventListener(PAGE_FORCE_REFRESH_EVENT, onForce);
      window.removeEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, onCommit);
    };
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
