import type { Board, ForumStats } from '../api/types';

const BOARDS_KEY = 'j13-cache-boards';
const STATS_KEY = 'j13-cache-stats';

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

export function setCachedBoards(boards: Board[]) {
  writeJson(BOARDS_KEY, boards);
}

export function setCachedStats(stats: ForumStats) {
  writeJson(STATS_KEY, stats);
}
