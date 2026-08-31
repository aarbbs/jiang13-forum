import type { NavigateFunction } from 'react-router-dom';
import { postPath, type PermalinkOpts } from './permalink';
import { transitionTo } from './spaTransition';

export type OpenForumPostOpts = PermalinkOpts & {
  /** 跳转到指定楼层（#floor-N） */
  floor?: number;
};

/** 按站点配置打开帖子详情（当前页跳转或新标签） */
export function openForumPost(
  nav: NavigateFunction,
  postId: number,
  openInNewTab: boolean,
  opts?: OpenForumPostOpts,
) {
  const path = postPath(postId, opts) + (opts?.floor && opts.floor > 0 ? `#floor-${opts.floor}` : '');
  if (openInNewTab) {
    window.open(path, '_blank', 'noopener,noreferrer');
    return;
  }
  void transitionTo(nav, path);
}
