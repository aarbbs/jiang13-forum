import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ForumLimitsPublic } from '../api/types';
import { DEFAULT_ASIDE_WIDGETS } from '../api/types';

const DEFAULT_LIMITS: ForumLimitsPublic = {
  post_title_max: 128,
  post_tags_max: 256,
  post_content_max: 50000,
  comment_max: 5000,
  comment_edit_window_minutes: 3,
  search_keyword_min: 1,
  search_keyword_max: 50,
  page_size_default: 30,
  password_min_len: 6,
  avatar_max_mb: 2,
  signature_max: 200,
  open_posts_in_new_tab: true,
  open_content_links_in_new_tab: true,
  aside_show_tag_cloud: false,
  aside_show_recent_comments: false,
  aside_show_friend_links: true,
  aside_show_showcase: false,
  aside_widgets: DEFAULT_ASIDE_WIDGETS,
  nav_show_friend_links: true,
  footer_show_friend_links: true,
  nav_show_showcase: false,
  footer_show_showcase: false,
  feed_list_style: 'title',
  permalink_enabled: false,
  permalink_ext: 'html',
  monitor_pageview: false,
};

let cached: ForumLimitsPublic | null = null;
let inflight: Promise<ForumLimitsPublic> | null = null;
let cacheEpoch = 0;
const listeners = new Set<() => void>();

function fetchLimits(): Promise<ForumLimitsPublic> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = api.forumLimits()
    .then(limits => {
      cached = limits;
      return limits;
    })
    .catch(() => cached ?? DEFAULT_LIMITS)
    .finally(() => { inflight = null; });
  return inflight;
}

/** 获取前台可见的论坛限制配置 */
export function useForumLimits() {
  const [limits, setLimits] = useState<ForumLimitsPublic>(cached ?? DEFAULT_LIMITS);
  const [loading, setLoading] = useState(!cached);
  const [epoch, setEpoch] = useState(cacheEpoch);

  useEffect(() => {
    const onInvalidate = () => setEpoch(cacheEpoch);
    listeners.add(onInvalidate);
    return () => { listeners.delete(onInvalidate); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // 无缓存时显示加载中，避免首页用默认 30/300 误拉全量
    if (!cached) setLoading(true);
    fetchLimits()
      .then(next => {
        if (!cancelled) setLimits(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [epoch]);

  return { limits, loading };
}

/** 清除缓存并通知已挂载的 hook 重新拉取 */
export function invalidateForumLimitsCache() {
  cached = null;
  cacheEpoch += 1;
  listeners.forEach(fn => fn());
}

/** 同步读取已缓存的论坛限制（供路径生成等非 hook 场景） */
export function getCachedForumLimits(): ForumLimitsPublic {
  return cached ?? DEFAULT_LIMITS;
}
