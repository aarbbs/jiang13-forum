import type { Comment } from '../api/types';

export interface CommentNode {
  comment: Comment;
  children: CommentNode[];
}

/** 评论显示昵称 */
export function commentNick(c: Comment): string {
  if (c.user?.nickname) return c.user.nickname;
  if (c.guest_nick) return c.guest_nick;
  return '游客';
}

/** 评论头像首字 */
export function commentInitial(c: Comment): string {
  return commentNick(c)[0] || '?';
}

/** 是否为游客评论 */
export function isGuestComment(c: Comment): boolean {
  return !c.user_id || c.user_id === 0;
}

/** 构建嵌套评论树（优先 thread_parent_id，回退 reply_to） */
export function buildCommentTree(comments: Comment[]): CommentNode[] {
  const map = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];

  for (const c of comments) {
    map.set(c.id, { comment: c, children: [] });
  }

  for (const c of comments) {
    const node = map.get(c.id)!;
    const parentId = c.thread_parent_id ?? c.reply_to;
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** 评论日期：当年显示 MM月DD日 */
export function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
