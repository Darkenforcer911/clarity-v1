export const ACTIVE_ACTION_SWIPE_REVEAL_PX = 92;
export const ACTIVE_ACTION_SWIPE_OPEN_THRESHOLD_PX = 52;
export const ACTIVE_ACTION_SWIPE_CLOSE_THRESHOLD_PX = 40;

export function shouldRevealActiveActionRemove(offset: number) {
  return offset <= -ACTIVE_ACTION_SWIPE_OPEN_THRESHOLD_PX;
}

export function resolveActiveActionSwipeOpen(
  startOffset: number,
  endOffset: number,
) {
  const startedOpen = startOffset < 0;

  if (!startedOpen) {
    return shouldRevealActiveActionRemove(endOffset);
  }

  const closeBoundary =
    -ACTIVE_ACTION_SWIPE_REVEAL_PX +
    ACTIVE_ACTION_SWIPE_CLOSE_THRESHOLD_PX;

  return endOffset < closeBoundary;
}
