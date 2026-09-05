export function resolveShapeTodaySwipeItem(
  currentItemKey: string | null,
  changedItemKey: string,
  open: boolean,
) {
  if (open) return changedItemKey;
  return currentItemKey === changedItemKey ? null : currentItemKey;
}
