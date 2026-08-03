import { getCachedForumLimits } from '../hooks/useForumLimits';

export type PermalinkOpts = {
  permalink_enabled?: boolean;
  permalink_ext?: string;
};

const EXT_RE = /^[a-z0-9]{1,16}$/i;

/** 规范化伪静态后缀（无点） */
export function normalizePermalinkExt(raw?: string): string {
  let ext = (raw ?? 'html').trim().replace(/^\./, '').toLowerCase();
  if (!ext || !EXT_RE.test(ext)) return 'html';
  return ext;
}

function suffix(opts?: PermalinkOpts): string {
  const limits = opts ?? getCachedForumLimits();
  if (!limits.permalink_enabled) return '';
  return `.${normalizePermalinkExt(limits.permalink_ext)}`;
}

/** 帖子规范路径：/post/123 或 /post/123.html */
export function postPath(id: number | string, opts?: PermalinkOpts): string {
  return `/post/${id}${suffix(opts)}`;
}

/** 用户规范路径 */
export function userPath(id: number | string, opts?: PermalinkOpts): string {
  return `/user/${id}${suffix(opts)}`;
}

/** 从路由参数解析数字 ID（兼容 123 / 123.html） */
export function parsePermalinkID(raw: string | undefined): number {
  if (!raw) return NaN;
  const m = String(raw).match(/^(\d+)(?:\.[A-Za-z0-9]{1,16})?$/);
  return m ? Number(m[1]) : NaN;
}

/** 客户端：若当前 URL 非规范伪静态路径则返回应跳转的目标 */
export function canonicalRedirectPath(
  kind: 'post' | 'user',
  id: number,
  currentPathname: string,
  opts?: PermalinkOpts,
): string | null {
  if (!id || Number.isNaN(id)) return null;
  const target = kind === 'post' ? postPath(id, opts) : userPath(id, opts);
  const cur = currentPathname.replace(/\/$/, '') || '/';
  const want = target.replace(/\/$/, '') || '/';
  return cur === want ? null : target;
}
