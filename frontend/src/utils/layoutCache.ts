import type { Board, ForumStats, RecentComment, RecentUser, TagCount } from '../api/types';

const BOARDS_KEY = 'j13-cache-boards';
const STATS_KEY = 'j13-cache-stats';
const RECENT_COMMENTS_KEY = 'j13-cache-recent-comments';
const RECENT_USERS_KEY = 'j13-cache-recent-users';
const TAGS_KEY = 'j13-cache-tags';

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage 不可用时忽略
  }
}

/** 读取缓存的板块列表，用于刷新时立即还原布局 */
export function getCachedBoards(): Board[] {
  return readJson<Board[]>(BOARDS_KEY) ?? [];
}

/** 读取缓存的论坛统计，用于刷新时立即还原 FeedHeader 高度 */
export function getCachedStats(): ForumStats | null {
  return readJson<ForumStats>(STATS_KEY);
}

/** 读取缓存的最新评论，避免右栏/抽屉首屏高度跳动 */
export function getCachedRecentComments(): RecentComment[] {
  const list = readJson<RecentComment[]>(RECENT_COMMENTS_KEY);
  return Array.isArray(list) ? list : [];
}

/** 读取缓存的最新注册用户 */
export function getCachedRecentUsers(): RecentUser[] {
  const list = readJson<RecentUser[]>(RECENT_USERS_KEY);
  return Array.isArray(list) ? list : [];
}

/** 读取缓存的标签云 */
export function getCachedTags(): TagCount[] {
  const list = readJson<TagCount[]>(TAGS_KEY);
  return Array.isArray(list) ? list : [];
}

/** 右栏是否已有可展示的 session 缓存（含空列表） */
export function hasCachedAside(): boolean {
  try {
    return sessionStorage.getItem(RECENT_COMMENTS_KEY) != null
      || sessionStorage.getItem(RECENT_USERS_KEY) != null
      || sessionStorage.getItem(TAGS_KEY) != null;
  } catch {
    return false;
  }
}

export function setCachedBoards(boards: Board[]) {
  writeJson(BOARDS_KEY, boards);
}

export function setCachedStats(stats: ForumStats) {
  writeJson(STATS_KEY, stats);
}

export function setCachedRecentComments(list: RecentComment[]) {
  writeJson(RECENT_COMMENTS_KEY, list);
}

export function setCachedRecentUsers(list: RecentUser[]) {
  writeJson(RECENT_USERS_KEY, list);
}

export function setCachedTags(tags: TagCount[]) {
  writeJson(TAGS_KEY, tags);
}
