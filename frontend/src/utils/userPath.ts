import { userPath as permalinkUserPath, type PermalinkOpts } from './permalink';

/** 用户公开主页路径（遵循后台伪静态配置） */
export function userPath(id: number | string, opts?: PermalinkOpts): string {
  return permalinkUserPath(id, opts);
}
