export const CLARITY_KEYBOARD_THRESHOLD_PX = 96;
export const CLARITY_KEYBOARD_CLOSE_THRESHOLD_PX = 64;
export const CLARITY_KEYBOARD_DISMISS_SETTLE_MS = 120;
export const CLARITY_KEYBOARD_DISMISS_FALLBACK_MS = 450;
export const CLARITY_KEYBOARD_CLOSE_TRANSITION_MS = 180;
export const CLARITY_VIEWPORT_RESTING_HEIGHT_TOLERANCE_PX = 8;
export const CLARITY_VIEWPORT_RESTING_OFFSET_TOLERANCE_PX = 1;
export const CLARITY_INITIAL_LAYOUT_STABLE_FRAMES = 2;

export type ClarityInitialConversationSnapshot = {
  headerBottom: number;
  historyClientHeight: number;
  historyScrollHeight: number;
  hostTop: number;
  navigationTop: number;
  panelHeight: number;
  panelTop: number;
};

export function clarityConversationBottom(input: {
  clientHeight: number;
  scrollHeight: number;
}) {
  return Math.max(0, input.scrollHeight - input.clientHeight);
}

export function resolveClarityInitialConversationFrame(input: {
  contentReady: boolean;
  current: ClarityInitialConversationSnapshot;
  positionedAtBottom: boolean;
  previous: ClarityInitialConversationSnapshot | null;
  stableFrames: number;
}) {
  const stable =
    input.previous !== null &&
    Object.keys(input.current).every((key) => {
      const field = key as keyof ClarityInitialConversationSnapshot;
      return Math.abs(input.current[field] - input.previous![field]) < 1;
    });
  const stableFrames =
    input.contentReady && input.positionedAtBottom && stable
      ? input.stableFrames + 1
      : 0;

  return {
    ready: stableFrames >= CLARITY_INITIAL_LAYOUT_STABLE_FRAMES,
    stableFrames,
  };
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

export function resolveClarityConversationViewport(input: {
  visibleHeight: number;
  visibleOffsetTop: number;
  hostTop: number;
  headerBottom: number;
  navigationTop: number | null;
  keyboardOpen: boolean;
  navigationGap?: number;
}) {
  const visibleBottom = input.visibleOffsetTop + input.visibleHeight;
  if (input.keyboardOpen) {
    const top = Math.max(
      input.visibleOffsetTop,
      Math.min(input.headerBottom, visibleBottom - 1),
    );
    return {
      top,
      height: Math.max(1, Math.floor(visibleBottom - top)),
    };
  }

  const bottom = input.navigationTop === null
    ? visibleBottom
    : Math.min(visibleBottom, input.navigationTop);
  return {
    top: input.hostTop,
    height: Math.max(
      1,
      Math.floor(bottom - input.hostTop - (input.navigationGap ?? 8)),
    ),
  };
}
