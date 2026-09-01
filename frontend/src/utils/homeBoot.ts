import type {
  Board,
  CheckInStatus,
  CommunityShowcaseItem,
  ForumLimitsPublic,
  ForumStats,
  PostItem,
  RecentComment,
  RecentUser,
  SiteBranding,
  SitePageSummary,
  TagCount,
  User,
} from '../api/types';
import { seedSiteBrandingCache } from '../hooks/useSiteBranding';
import { seedForumLimitsCache } from '../hooks/useForumLimits';
import { seedSitePagesCache } from '../hooks/useSitePages';
import { feedCacheKey, getHomeStoreState } from '../store/homeStore';
import {
  setCachedBoards,
  setCachedRecentComments,
  setCachedRecentUsers,
  setCachedStats,
  setCachedTags,
} from './layoutCache';
import { setSessionSnapshot } from './sessionPageCache';
import { seedAuthFromHomeBoot } from './authBoot';
import { checkInCacheKey } from '../hooks/useCheckIn';
import type { FeedSort } from '../components/FeedSortBar';

/** 与 Go homeBootPayload / window.__J13_HOME_BOOT__ 对齐 */
export type HomeBootPayload = {
  board_id: number;
  sort: string;
  keyword: string;
  tag: string;
  author: string;
  title_only: boolean;
  posts: PostItem[];
  post_total: number;
  page: number;
  boards: Board[];
  stats: ForumStats;
  recent_comments: RecentComment[];
  recent_users: RecentUser[];
  tags: TagCount[];
  showcase?: CommunityShowcaseItem[];
  pages: SitePageSummary[];
  limits: ForumLimitsPublic;
  branding: SiteBranding;
  user?: User | null;
  unread_messages?: number;
  check_in?: CheckInStatus | null;
};

declare global {
  interface Window {
    __J13_HOME_BOOT__?: HomeBootPayload;
  }
}

/** 读取并清除文档 SSR 注入的首页 boot，灌入各层缓存 */
export function consumeHomeBoot(): HomeBootPayload | null {
  const boot = window.__J13_HOME_BOOT__;
  try {
    delete window.__J13_HOME_BOOT__;
  } catch {
    window.__J13_HOME_BOOT__ = undefined;
  }
  if (!boot || typeof boot !== 'object') return null;

  if (boot.limits) seedForumLimitsCache(boot.limits);
  if (boot.branding) seedSiteBrandingCache(boot.branding);
  if (Array.isArray(boot.pages)) seedSitePagesCache(boot.pages);
  if (Array.isArray(boot.boards)) setCachedBoards(boot.boards);
  if (boot.stats) setCachedStats(boot.stats);
  if (Array.isArray(boot.recent_comments)) setCachedRecentComments(boot.recent_comments);
  if (Array.isArray(boot.recent_users)) setCachedRecentUsers(boot.recent_users);
  if (Array.isArray(boot.tags)) setCachedTags(boot.tags);
  // 仅当 boot 显式带 showcase 时灌入（侧栏关闭时省略，避免 [] 粘死）
  if ('showcase' in boot && Array.isArray(boot.showcase)) {
    setSessionSnapshot('showcase', boot.showcase);
  }

  // 鉴权 / 签到：有 user 字段即种子（含 null = 已确认访客）
  if ('user' in boot) {
    seedAuthFromHomeBoot(boot.user ?? null, boot.unread_messages ?? 0);
    const uid = boot.user?.id;
    if (uid && boot.check_in) {
      setSessionSnapshot(checkInCacheKey(uid), boot.check_in);
    }
  }

  const sort = (boot.sort || 'reply') as FeedSort;
  const key = feedCacheKey({
    boardId: boot.board_id || 0,
    keyword: boot.keyword || '',
    tag: boot.tag || '',
    author: boot.author || '',
    titleOnly: !!boot.title_only,
    sort,
  });
  const posts = Array.isArray(boot.posts) ? boot.posts : [];
  getHomeStoreState().setFeed(key, {
    posts,
    postTotal: boot.post_total ?? posts.length,
    page: boot.page || 1,
    scrollTop: 0,
    lastFetchTime: Date.now(),
  });

  return boot;
}
