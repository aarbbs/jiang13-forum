import type { User } from '../api/types';

/** 首页 SSR boot 注入的鉴权种子（consumeHomeBoot 写入；AuthProvider 仅 peek，保留至下次 boot） */
let seededUser: User | null | undefined;
let seededUnread = 0;
let hasAuthSeed = false;
/** 未读数可被 MainLayout 同步读取 */
let bootUnread = 0;

export function seedAuthFromHomeBoot(user: User | null | undefined, unread: number) {
  hasAuthSeed = true;
  seededUser = user ?? null;
  seededUnread = Math.max(0, unread | 0);
  bootUnread = seededUnread;
}

type AuthSeed = { hasSeed: boolean; user: User | null; unread: number };

/** 只读种子，不清空（StrictMode 双挂 / useState initializer 可重复调用） */
export function peekAuthSeed(): AuthSeed {
  if (!hasAuthSeed) {
    return { hasSeed: false, user: null, unread: bootUnread };
  }
  return { hasSeed: true, user: seededUser ?? null, unread: seededUnread };
}

/** mount 后清除用户种子，避免后续误用 */
export function clearAuthSeed() {
  hasAuthSeed = false;
  seededUser = undefined;
  seededUnread = 0;
}

/** @deprecated 改用 peekAuthSeed + clearAuthSeed；保留兼容 */
export function takeAuthSeed(): AuthSeed {
  const s = peekAuthSeed();
  if (s.hasSeed) clearAuthSeed();
  return s;
}

export function getBootUnread(): number {
  return bootUnread;
}
