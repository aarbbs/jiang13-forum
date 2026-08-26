import type { Comment } from '../api/types';
import type { CommentNode } from '../utils/comment';

/** 评论树中是否包含指定评论 ID */
export function commentTreeContains(node: CommentNode, commentId: number): boolean {
  if (node.comment.id === commentId) return true;
  return node.children.some(child => commentTreeContains(child, commentId));
}

/** 将含被采纳评论的根楼层置顶 */
export function pinAwardedCommentTree(
  tree: CommentNode[],
  awardedCommentId?: number,
): CommentNode[] {
  if (!awardedCommentId) return tree;
  const idx = tree.findIndex(node => commentTreeContains(node, awardedCommentId));
  if (idx <= 0) return tree;
  const next = [...tree];
  const [node] = next.splice(idx, 1);
  next.unshift(node);
  return next;
}

/** 根据评论 ID 查找楼层号 */
export function findCommentFloor(comments: Comment[], commentId?: number): number | null {
  if (!commentId) return null;
  const hit = comments.find(c => c.id === commentId);
  return hit?.floor ?? null;
}
