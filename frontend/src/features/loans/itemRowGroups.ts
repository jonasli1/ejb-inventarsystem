/**
 * Shared reorder logic for loan item rows (used by LoanCreateModal and
 * LoanEditModal) - a "group" is a main row plus its trailing accessory rows
 * (an accessory always stays adjacent to, and moves together with, its main
 * object), keyed by `accessoryOfItemId` matching the main row's
 * `inventoryItemId`.
 */
export interface GroupableRow {
  inventoryItemId: string;
  accessoryOfItemId?: string;
  mode: string;
}

export function groupBounds<T extends GroupableRow>(list: T[], index: number): [number, number] {
  let start = index;
  while (start > 0 && list[start].accessoryOfItemId) start--;
  let end = start;
  while (end + 1 < list.length && list[end + 1].accessoryOfItemId === list[start].inventoryItemId) end++;
  return [start, end];
}

/**
 * Moves the whole group containing `index` up (-1) or down (1), swapping it
 * with the adjacent group. A no-op if there's nothing to swap with - at the
 * start/end of the list, or (moving down) when the next row is a trailing
 * empty placeholder (`mode === ''`).
 */
export function moveGroup<T extends GroupableRow>(list: T[], index: number, direction: -1 | 1): T[] {
  const [start, end] = groupBounds(list, index);
  if (direction === -1) {
    if (start === 0) return list;
    const [prevStart] = groupBounds(list, start - 1);
    return [
      ...list.slice(0, prevStart),
      ...list.slice(start, end + 1),
      ...list.slice(prevStart, start),
      ...list.slice(end + 1),
    ];
  }
  const next = list[end + 1];
  if (!next || next.mode === '') return list;
  const [, nextEnd] = groupBounds(list, end + 1);
  return [
    ...list.slice(0, start),
    ...list.slice(end + 1, nextEnd + 1),
    ...list.slice(start, end + 1),
    ...list.slice(nextEnd + 1),
  ];
}
