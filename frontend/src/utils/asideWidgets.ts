import type { AsideWidget, AsideWidgetId, ForumLimits, ForumLimitsPublic } from '../api/types';
import { DEFAULT_ASIDE_WIDGETS } from '../api/types';

const ASIDE_WIDGET_IDS: AsideWidgetId[] = ['tag_cloud', 'recent_comments', 'friend_links'];

/** 从 limits 解析右侧栏组件列表（兼容仅有布尔开关的旧数据） */
export function resolveAsideWidgets(
  limits: Pick<ForumLimitsPublic, 'aside_widgets' | 'aside_show_tag_cloud' | 'aside_show_recent_comments' | 'aside_show_friend_links'>,
): AsideWidget[] {
  if (limits.aside_widgets?.length) {
    return normalizeAsideWidgets(limits.aside_widgets);
  }
  return [
    { id: 'tag_cloud', enabled: limits.aside_show_tag_cloud },
    { id: 'recent_comments', enabled: limits.aside_show_recent_comments },
    { id: 'friend_links', enabled: limits.aside_show_friend_links },
  ];
}

/** 校验并补全右侧栏组件列表 */
export function normalizeAsideWidgets(widgets: AsideWidget[]): AsideWidget[] {
  const seen = new Set<AsideWidgetId>();
  const out: AsideWidget[] = [];
  for (const w of widgets) {
    if (!ASIDE_WIDGET_IDS.includes(w.id) || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push({ id: w.id, enabled: !!w.enabled });
  }
  for (const id of ASIDE_WIDGET_IDS) {
    if (!seen.has(id)) out.push({ id, enabled: false });
  }
  return out;
}

/** 将 aside_widgets 同步回 ForumLimits 布尔字段 */
export function syncAsideBoolsFromWidgets(widgets: AsideWidget[]): Pick<ForumLimits, 'aside_show_tag_cloud' | 'aside_show_recent_comments' | 'aside_show_friend_links'> {
  const normalized = normalizeAsideWidgets(widgets);
  return {
    aside_show_tag_cloud: normalized.find(w => w.id === 'tag_cloud')?.enabled ?? false,
    aside_show_recent_comments: normalized.find(w => w.id === 'recent_comments')?.enabled ?? false,
    aside_show_friend_links: normalized.find(w => w.id === 'friend_links')?.enabled ?? true,
  };
}

/** 合并右侧栏组件到论坛限制（保存 API 时使用） */
export function mergeForumLimitsWithAsideWidgets(limits: ForumLimits, widgets: AsideWidget[]): ForumLimits {
  const normalized = normalizeAsideWidgets(widgets);
  return {
    ...limits,
    aside_widgets: normalized,
    ...syncAsideBoolsFromWidgets(normalized),
  };
}

/** 保存后优先采用服务端返回的 aside_widgets，缺失时保留本次提交值 */
export function resolveSavedAsideWidgets(saved: AsideWidget[], response?: AsideWidget[] | null): AsideWidget[] {
  if (response?.length) return normalizeAsideWidgets(response);
  return normalizeAsideWidgets(saved);
}

export function isAsideWidgetEnabled(widgets: AsideWidget[], id: AsideWidgetId): boolean {
  return resolveAsideWidgets({
    aside_widgets: widgets,
    aside_show_tag_cloud: false,
    aside_show_recent_comments: false,
    aside_show_friend_links: false,
  }).find(w => w.id === id)?.enabled ?? false;
}

export { DEFAULT_ASIDE_WIDGETS };
