export const CLARITY_KEYBOARD_THRESHOLD_PX = 96;
export const CLARITY_KEYBOARD_CLOSE_THRESHOLD_PX = 64;
export const CLARITY_KEYBOARD_DISMISS_SETTLE_MS = 120;
export const CLARITY_KEYBOARD_DISMISS_FALLBACK_MS = 450;
export const CLARITY_VIEWPORT_RESTING_HEIGHT_TOLERANCE_PX = 8;
export const CLARITY_VIEWPORT_RESTING_OFFSET_TOLERANCE_PX = 1;
export const CLARITY_HISTORY_GEOMETRY_TOLERANCE_PX = 1;

export function clarityConversationBottom(input: {
  clientHeight: number;
  scrollHeight: number;
}) {
  return Math.max(0, input.scrollHeight - input.clientHeight);
}

export type ClarityHistoryGeometry = {
  clientHeight: number;
  contentHeight: number;
  scrollHeight: number;
};

export function resolveClarityInitialHistoryMeasurement(input: {
  actualScrollTop: number;
  current: ClarityHistoryGeometry;
  observerDelivered: boolean;
  previous: ClarityHistoryGeometry | null;
}) {
  const expectedBottom = clarityConversationBottom(input.current);
  const validGeometry =
    input.current.clientHeight > 0 &&
    input.current.contentHeight >= 0 &&
    input.current.scrollHeight >= input.current.clientHeight;
  const stableGeometry =
    input.previous !== null &&
    Math.abs(input.current.clientHeight - input.previous.clientHeight) <
      CLARITY_HISTORY_GEOMETRY_TOLERANCE_PX &&
    Math.abs(input.current.contentHeight - input.previous.contentHeight) <
      CLARITY_HISTORY_GEOMETRY_TOLERANCE_PX &&
    Math.abs(input.current.scrollHeight - input.previous.scrollHeight) <
      CLARITY_HISTORY_GEOMETRY_TOLERANCE_PX;
  const positionedAtBottom =
    Math.abs(input.actualScrollTop - expectedBottom) <
    CLARITY_HISTORY_GEOMETRY_TOLERANCE_PX;

  return {
    expectedBottom,
    ready:
      input.observerDelivered &&
      validGeometry &&
      stableGeometry &&
      positionedAtBottom,
  };
}

export function clarityComposerKeyboardBottomOffset(input: {
  layoutViewportHeight: number;
  visibleHeight: number;
  visibleOffsetTop: number;
}) {
  return Math.max(
    0,
    input.layoutViewportHeight -
      (input.visibleOffsetTop + input.visibleHeight),
  );
}

export function clarityHistoryBottomInset(input: {
  composerDockTop: number;
  historyBottom: number;
}) {
  return Math.max(0, input.historyBottom - input.composerDockTop);
}

export function isClarityViewportNearResting(input: {
  baselineHeight: number;
  visibleHeight: number;
  visibleOffsetTop: number;
}) {
  return (
    Math.abs(input.baselineHeight - input.visibleHeight) <=
      CLARITY_VIEWPORT_RESTING_HEIGHT_TOLERANCE_PX &&
    Math.abs(input.visibleOffsetTop) <=
      CLARITY_VIEWPORT_RESTING_OFFSET_TOLERANCE_PX
  );
}

export function resolveClarityKeyboardDismissalDelay(input: {
  dismissalStartedAt: number;
  observedAt: number;
  baselineHeight: number;
  visibleHeight: number;
  visibleOffsetTop: number;
}) {
  const fallbackRemaining = Math.max(
    0,
    CLARITY_KEYBOARD_DISMISS_FALLBACK_MS -
      Math.max(0, input.observedAt - input.dismissalStartedAt),
  );
  if (!isClarityViewportNearResting(input)) return fallbackRemaining;
  return Math.min(CLARITY_KEYBOARD_DISMISS_SETTLE_MS, fallbackRemaining);
}

export function isClarityKeyboardOpen(input: {
  baselineHeight: number;
  visibleHeight: number;
  visibleOffsetTop: number;
  previouslyOpen?: boolean;
}) {
  const threshold = input.previouslyOpen
    ? CLARITY_KEYBOARD_CLOSE_THRESHOLD_PX
    : CLARITY_KEYBOARD_THRESHOLD_PX;
  return (
    input.baselineHeight - input.visibleHeight >= threshold ||
    input.visibleOffsetTop >= threshold
  );
}

export function resolveClarityKeyboardPhase(input: {
  baselineHeight: number;
  visibleHeight: number;
  visibleOffsetTop: number;
  previouslyOpen: boolean;
  dismissalPending: boolean;
}): "closed" | "open" | "closing" {
  if (isClarityKeyboardOpen(input)) return "open";
  if (input.previouslyOpen || input.dismissalPending) return "closing";
  return "closed";
}
