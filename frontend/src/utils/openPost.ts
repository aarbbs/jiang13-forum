import type { NavigateFunction } from 'react-router-dom';

/** 按站点配置打开帖子详情（当前页跳转或新标签） */
export function openForumPost(
  nav: NavigateFunction,
  postId: number,
  openInNewTab: boolean,
) {
  const path = `/post/${postId}`;
  if (openInNewTab) {
    window.open(path, '_blank', 'noopener,noreferrer');
    return;
  }
  nav(path);
}
