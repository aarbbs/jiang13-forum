import type { FriendLinkApply } from '../api/types';

/** 解析友链 LOGO 为可加载的 URL（相对路径补全为当前站点 origin） */
export function resolveFriendLinkLogo(logo?: string, siteURL?: string): string {
  const raw = logo?.trim() || '';
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) {
    const base = siteURL?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
    return base ? `${base.replace(/\/$/, '')}${raw}` : raw;
  }
  return raw;
}

/** 回链检测是否仍在后台进行中 */
export function isReciprocalChecking(apply: FriendLinkApply): boolean {
  if (apply.status !== 'pending') return false;
  if (apply.reciprocal_checked_at) return false;
  if (apply.reciprocal_verified) return false;
  if (apply.reciprocal_check_note?.trim()) return false;
  return true;
}

export function reciprocalStatusLabel(apply: FriendLinkApply): {
  text: string;
  variant: 'green' | 'orange' | 'secondary';
} {
  if (isReciprocalChecking(apply)) {
    return { text: '检测中…', variant: 'secondary' };
  }
  if (apply.reciprocal_verified) {
    return { text: '回链已检测到', variant: 'green' };
  }
  if (apply.reciprocal_check_note?.trim()) {
    return { text: apply.reciprocal_check_note, variant: 'orange' };
  }
  return { text: '未检测', variant: 'secondary' };
}
