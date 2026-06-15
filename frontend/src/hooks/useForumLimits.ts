import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ForumLimitsPublic } from '../api/types';

const DEFAULT_LIMITS: ForumLimitsPublic = {
  post_title_max: 128,
  post_tags_max: 256,
  post_content_max: 50000,
  comment_max: 5000,
  search_keyword_min: 1,
  search_keyword_max: 50,
  password_min_len: 6,
  avatar_max_mb: 2,
};

let cached: ForumLimitsPublic | null = null;
let inflight: Promise<ForumLimitsPublic> | null = null;

function fetchLimits(): Promise<ForumLimitsPublic> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = api.forumLimits()
    .then(limits => {
      cached = limits;
      return limits;
    })
    .catch(() => DEFAULT_LIMITS)
    .finally(() => { inflight = null; });
  return inflight;
}

/** 获取前台可见的论坛限制配置 */
export function useForumLimits() {
  const [limits, setLimits] = useState<ForumLimitsPublic>(cached ?? DEFAULT_LIMITS);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    fetchLimits().then(setLimits).finally(() => setLoading(false));
  }, []);

  return { limits, loading };
}

export function invalidateForumLimitsCache() {
  cached = null;
}
