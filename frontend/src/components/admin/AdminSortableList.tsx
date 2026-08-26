import {
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reorderItems, shouldShowSortableMoveButtons } from '../../utils/sortOrder';

export type SortableItemControls = {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  isDragging: boolean;
  dragHandleProps: HTMLAttributes<HTMLButtonElement>;
  moveUp: () => void;
  moveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

type AdminSortableListProps<T> = {
  items: T[];
  getId: (item: T) => string | number;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number, controls: SortableItemControls) => ReactNode;
  showMoveButtons?: boolean | 'auto';
  strategy?: 'vertical' | 'grid';
  as?: ElementType;
  className?: string;
  ariaLabel?: string;
};

function resolveStrategy(mode: 'vertical' | 'grid'): SortingStrategy {
  return mode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy;
}

function SortableItem<T>({
  item,
  index,
  items,
  getId,
  onReorder,
  showMoveButtons,
  renderItem,
}: {
  item: T;
  index: number;
  items: T[];
  getId: (item: T) => string | number;
  onReorder: (items: T[]) => void;
  showMoveButtons: boolean;
  renderItem: AdminSortableListProps<T>['renderItem'];
}) {
  const id = getId(item);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const moveUp = () => {
    if (index > 0) onReorder(reorderItems(items, index, index - 1));
  };
  const moveDown = () => {
    if (index < items.length - 1) onReorder(reorderItems(items, index, index + 1));
  };

  const controls: SortableItemControls = {
    setNodeRef,
    style,
    isDragging,
    dragHandleProps: { ...attributes, ...listeners },
    moveUp,
    moveDown,
    canMoveUp: index > 0,
    canMoveDown: index < items.length - 1,
  };

  return (
    <>
      {renderItem(item, index, controls)}
      {showMoveButtons && (
        <span className="sr-only" aria-live="polite">
          {controls.canMoveUp ? '可上移' : ''}{controls.canMoveDown ? '可下移' : ''}
        </span>
      )}
    </>
  );
}

export function SortableDragHandle({
  label = '拖拽调整顺序',
  className = 'admin-sortable-row__handle',
  ...props
}: HTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      {...props}
    >
      <GripVertical size={16} aria-hidden />
    </button>
  );
}

export function SortableMoveButtons({
  controls,
  className = 'admin-sortable-row__order',
}: {
  controls: Pick<SortableItemControls, 'moveUp' | 'moveDown' | 'canMoveUp' | 'canMoveDown'>;
  className?: string;
}) {
  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!controls.canMoveUp}
        onClick={controls.moveUp}
        aria-label="上移"
      >
        <ArrowUp size={14} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!controls.canMoveDown}
        onClick={controls.moveDown}
        aria-label="下移"
      >
        <ArrowDown size={14} />
      </Button>
    </div>
  );
}

export default function AdminSortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  showMoveButtons = 'auto',
  strategy = 'vertical',
  as: Wrapper = 'div',
  className,
  ariaLabel,
}: AdminSortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const moveButtons = shouldShowSortableMoveButtons(items.length, showMoveButtons);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(item => getId(item) === active.id);
    const newIndex = items.findIndex(item => getId(item) === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(reorderItems(items, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(getId)} strategy={resolveStrategy(strategy)}>
        <Wrapper className={className} role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel}>
          {items.map((item, index) => (
            <SortableItem
              key={String(getId(item))}
              item={item}
              index={index}
              items={items}
              getId={getId}
              onReorder={onReorder}
              showMoveButtons={moveButtons}
              renderItem={renderItem}
            />
          ))}
        </Wrapper>
      </SortableContext>
    </DndContext>
  );
}
