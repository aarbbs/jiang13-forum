import AdminSortableList, { SortableDragHandle } from './AdminSortableList';
import type { AsideWidget, AsideWidgetId } from '../../api/types';

const WIDGET_META: Record<AsideWidgetId, { label: string; hint: string }> = {
  tag_cloud: {
    label: '标签云',
    hint: '在右侧栏展示热门标签',
  },
  recent_comments: {
    label: '最新评论',
    hint: '在右侧栏展示最近回复',
  },
  recent_users: {
    label: '最新注册',
    hint: '在右侧栏展示最近注册的用户',
  },
  friend_links: {
    label: '友情链接',
    hint: '关闭后不在右侧栏展示，友链仍可在「友情链接」页面查看与申请',
  },
};

type Props = {
  widgets: AsideWidget[];
  onChange: (next: AsideWidget[]) => void;
};

export default function AsideWidgetList({ widgets, onChange }: Props) {
  const handleToggle = (id: AsideWidgetId, enabled: boolean) => {
    onChange(widgets.map(w => (w.id === id ? { ...w, enabled } : w)));
  };

  return (
    <AdminSortableList
      items={widgets}
      getId={widget => widget.id}
      onReorder={onChange}
      showMoveButtons={false}
      className="admin-sortable-list admin-sortable-list--boxed"
      ariaLabel="右侧栏组件"
      renderItem={(widget, _index, controls) => {
        const meta = WIDGET_META[widget.id];
        return (
          <div
            ref={controls.setNodeRef}
            style={controls.style}
            className={`admin-sortable-row admin-sortable-row--widget${controls.isDragging ? ' is-dragging' : ''}`}
          >
            <SortableDragHandle
              label={`拖拽调整「${meta.label}」顺序`}
              {...controls.dragHandleProps}
            />
            <div className="admin-sortable-row__main">
              <span className="admin-sortable-row__label" id={`aside-widget-label-${widget.id}`}>
                {meta.label}
              </span>
              <span className="admin-sortable-row__hint">{meta.hint}</span>
            </div>
            <button
              type="button"
              id={`aside-widget-${widget.id}`}
              role="switch"
              aria-checked={widget.enabled}
              aria-labelledby={`aside-widget-label-${widget.id}`}
              className={`admin-settings-switch${widget.enabled ? ' is-on' : ''}`}
              onClick={() => handleToggle(widget.id, !widget.enabled)}
            >
              <span className="admin-settings-switch-ui" aria-hidden />
            </button>
          </div>
        );
      }}
    />
  );
}
