import { arrayMove } from '@dnd-kit/sortable';

export const ADMIN_SORTABLE_MOVE_BUTTONS_THRESHOLD = 8;

export function reorderItems<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) {
    return items;
  }
  return arrayMove(items, from, to);
}

export function assignSortOrders<T extends { sort_order?: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, sort_order: index + 1 }));
}

export function diffSortOrderChanges<T extends { id: number; sort_order?: number }>(
  before: T[],
  after: T[],
): Array<{ id: number; sort_order: number }> {
  const beforeMap = new Map(before.map(item => [item.id, item.sort_order ?? 0]));
  return after
    .filter(item => beforeMap.get(item.id) !== item.sort_order)
    .map(item => ({ id: item.id, sort_order: item.sort_order ?? 0 }));
}

/** 将子集重排结果合并回完整列表，并重算 sort_order */
export function mergeReorderedSubset<T extends { id: number; sort_order?: number }>(
  all: T[],
  subsetBefore: T[],
  subsetAfter: T[],
): T[] {
  const sorted = [...all].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  const subsetIds = new Set(subsetBefore.map(item => item.id));
  const result: T[] = [];
  let subsetIdx = 0;
  for (const item of sorted) {
    if (subsetIds.has(item.id)) {
      if (subsetIdx < subsetAfter.length) {
        result.push(subsetAfter[subsetIdx++]);
      }
    } else {
      result.push(item);
    }
  }
  return assignSortOrders(result);
}

export async function persistSortOrderChanges<T extends { id: number; sort_order?: number }>(
  before: T[],
  reordered: T[],
  updateItem: (item: T) => Promise<void>,
): Promise<T[]> {
  const after = assignSortOrders(reordered);
  const changes = diffSortOrderChanges(before, after);
  for (const change of changes) {
    const item = after.find(row => row.id === change.id);
    if (item) await updateItem(item);
  }
  return after;
}

export function shouldShowSortableMoveButtons(
  count: number,
  mode: boolean | 'auto' = 'auto',
): boolean {
  if (mode === true) return true;
  if (mode === false) return false;
  return count > ADMIN_SORTABLE_MOVE_BUTTONS_THRESHOLD;
}
