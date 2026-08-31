export const ACTIVE_ACTION_SWIPE_REVEAL_PX = 92;
export const ACTIVE_ACTION_SWIPE_OPEN_THRESHOLD_PX = 52;
export const ACTIVE_ACTION_SWIPE_CLOSE_THRESHOLD_PX = 40;
export const ACTIVE_ACTION_SWIPE_INTENT_THRESHOLD_PX = 10;
export const ACTIVE_ACTION_SWIPE_HORIZONTAL_INTENT_THRESHOLD_PX = 24;
export const ACTIVE_ACTION_SWIPE_DIRECTION_LOCK_PX = 8;

export type ActiveActionSwipeIntent =
  | "undecided"
  | "horizontal"
  | "vertical";

export function resolveActiveActionSwipeIntent(
  deltaX: number,
  deltaY: number,
  startedOpen = false,
): ActiveActionSwipeIntent {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (
    Math.max(horizontalDistance, verticalDistance) <
    ACTIVE_ACTION_SWIPE_INTENT_THRESHOLD_PX
  ) {
    return "undecided";
  }

  if (
    verticalDistance >= ACTIVE_ACTION_SWIPE_INTENT_THRESHOLD_PX &&
    verticalDistance >= horizontalDistance
  ) {
    return "vertical";
  }

  if (
    horizontalDistance >= ACTIVE_ACTION_SWIPE_HORIZONTAL_INTENT_THRESHOLD_PX &&
    horizontalDistance - verticalDistance >=
      ACTIVE_ACTION_SWIPE_DIRECTION_LOCK_PX &&
    horizontalDistance >= verticalDistance * 1.5 &&
    (startedOpen || deltaX < 0)
  ) {
    return "horizontal";
  }

  return "undecided";
}

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
