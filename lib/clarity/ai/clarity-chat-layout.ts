export const CLARITY_NEAR_BOTTOM_PX = 96;
export const CLARITY_KEYBOARD_THRESHOLD_PX = 96;

export function isClarityConversationNearBottom(input: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  threshold?: number;
}) {
  return (
    input.scrollHeight - input.scrollTop - input.clientHeight <=
    (input.threshold ?? CLARITY_NEAR_BOTTOM_PX)
  );
}

export function isClarityKeyboardOpen(input: {
  baselineHeight: number;
  visibleHeight: number;
  composerFocused: boolean;
}) {
  return (
    input.composerFocused &&
    input.baselineHeight - input.visibleHeight >=
      CLARITY_KEYBOARD_THRESHOLD_PX
  );
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
