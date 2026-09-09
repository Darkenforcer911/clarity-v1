const CLARITY_HISTORY_TOUCH_INTENT_PX = 4;

export type ClarityHistoryGestureDecision = {
  contain: boolean;
  deltaX: number;
  deltaY: number;
  thresholdExceeded: boolean;
  verticalDominant: boolean;
  blurTextarea: boolean;
};

export function resolveClarityHistoryGesture(input: {
  keyboardOpenAtStart: boolean;
  textareaFocusedAtStart: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}): ClarityHistoryGestureDecision {
  const deltaX = input.currentX - input.startX;
  const deltaY = input.currentY - input.startY;
  const thresholdExceeded =
    Math.abs(deltaY) >= CLARITY_HISTORY_TOUCH_INTENT_PX;
  const verticalDominant = Math.abs(deltaY) > Math.abs(deltaX);
  const contain =
    input.keyboardOpenAtStart && thresholdExceeded && verticalDominant;

  return {
    contain,
    deltaX,
    deltaY,
    thresholdExceeded,
    verticalDominant,
    blurTextarea: contain && input.textareaFocusedAtStart,
  };
}

export function preventClarityHistoryGestureDefault(
  event: Pick<Event, "cancelable" | "preventDefault">,
  contain: boolean,
) {
  if (!contain || !event.cancelable) return false;
  event.preventDefault();
  return true;
}
