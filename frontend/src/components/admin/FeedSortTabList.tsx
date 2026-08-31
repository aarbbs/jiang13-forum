import { Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import AdminSortableList, { SortableDragHandle } from './AdminSortableList';
import type { FeedSortId, FeedSortTab } from '../../api/types';
import { normalizeFeedSortTabs } from '../../utils/feedSortTabs';

const TAB_META: Record<FeedSortId, { hint: string; placeholder: string }> = {
  reply: { hint: '按最后评论时间', placeholder: '新评论' },
  latest: { hint: '按发帖时间', placeholder: '新帖子' },
  hot: { hint: '仅展示推荐帖', placeholder: '推荐帖' },
};

type Props = {
  tabs: FeedSortTab[];
  onChange: (next: FeedSortTab[]) => void;
};

export default function FeedSortTabList({ tabs, onChange }: Props) {
  const items = normalizeFeedSortTabs(tabs);

  const handleToggle = (id: FeedSortId, enabled: boolean) => {
    const next = items.map(t => (t.id === id ? { ...t, enabled } : t));
    // 不允许全部关闭：关掉最后一项时忽略
    if (!enabled && !next.some(t => t.enabled)) return;
    onChange(normalizeFeedSortTabs(next));
  };

  const handleLabel = (id: FeedSortId, label: string) => {
    onChange(normalizeFeedSortTabs(items.map(t => (t.id === id ? { ...t, label } : t))));
  };

  return (
    <AdminSortableList
      items={items}
      getId={tab => tab.id}
      onReorder={next => onChange(normalizeFeedSortTabs(next))}
      showMoveButtons={false}
      className="admin-sortable-list admin-sortable-list--boxed"
      ariaLabel="首页排序标签"
      renderItem={(tab, _index, controls) => {
        const meta = TAB_META[tab.id];
        return (
          <div
            ref={controls.setNodeRef}
            style={controls.style}
            className={`admin-sortable-row admin-sortable-row--widget${controls.isDragging ? ' is-dragging' : ''}`}
          >
            <SortableDragHandle
              label={`拖拽调整「${tab.label || meta.placeholder}」顺序`}
              {...controls.dragHandleProps}
            />
            <div className="admin-sortable-row__main">
              <label className="admin-sortable-row__field" htmlFor={`feed-sort-label-${tab.id}`}>
                <span className="admin-sortable-row__field-name">显示名称</span>
                <span className="admin-sortable-row__name-wrap">
                  <Input
                    id={`feed-sort-label-${tab.id}`}
                    type="text"
                    className="admin-sortable-row__name-input"
                    value={tab.label}
                    maxLength={16}
                    placeholder={meta.placeholder}
                    onChange={e => handleLabel(tab.id, e.target.value)}
                    aria-describedby={`feed-sort-hint-${tab.id}`}
                  />
                  <Pencil className="admin-sortable-row__name-icon" size={14} aria-hidden />
                </span>
              </label>
              <span className="admin-sortable-row__hint" id={`feed-sort-hint-${tab.id}`}>
                {meta.hint}
              </span>
            </div>
            <button
              type="button"
              id={`feed-sort-${tab.id}`}
              role="switch"
              aria-checked={tab.enabled}
              aria-label={`启用「${tab.label || meta.placeholder}」`}
              className={`admin-settings-switch${tab.enabled ? ' is-on' : ''}`}
              onClick={() => handleToggle(tab.id, !tab.enabled)}
            >
              <span className="admin-settings-switch-ui" aria-hidden />
            </button>
          </div>
        );
      }}
    />
  );
}
