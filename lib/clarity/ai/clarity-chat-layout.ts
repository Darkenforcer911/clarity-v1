export const CLARITY_KEYBOARD_THRESHOLD_PX = 96;
export const CLARITY_KEYBOARD_CLOSE_THRESHOLD_PX = 32;

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
