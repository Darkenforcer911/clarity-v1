export const CLARITY_COMPOSER_MIN_HEIGHT_PX = 44;
export const CLARITY_COMPOSER_MAX_HEIGHT_PX = 176;

export function clarityComposerHeight(scrollHeight: number) {
  const height = Math.min(
    CLARITY_COMPOSER_MAX_HEIGHT_PX,
    Math.max(CLARITY_COMPOSER_MIN_HEIGHT_PX, Math.ceil(scrollHeight)),
  );
  return {
    height,
    scrolls: scrollHeight > CLARITY_COMPOSER_MAX_HEIGHT_PX,
  };
}

const CLARITY_COMPOSER_TOUCH_INTENT_PX = 4;
const CLARITY_COMPOSER_SCROLL_EDGE_PX = 1;

export type ClarityComposerTouchInput = {
  origin: "textarea" | "composer";
  startX: number;
  startY: number;
  lastY: number;
  currentX: number;
  currentY: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  eventTargetsTextarea: boolean;
};

export type ClarityComposerTouchDecision = {
  contain: boolean;
  deltaX: number;
  deltaY: number;
  thresholdExceeded: boolean;
  verticalDominant: boolean;
  textareaScrollable: boolean;
  textareaAtBoundary: boolean;
  skipReason:
    | "below-threshold"
    | "horizontal-dominant"
    | "no-vertical-step"
    | "textarea-can-scroll"
    | null;
};

export function resolveClarityComposerTouch(
  input: ClarityComposerTouchInput,
): ClarityComposerTouchDecision {
  const deltaX = input.currentX - input.startX;
  const deltaY = input.currentY - input.startY;
  const horizontalTravel = Math.abs(deltaX);
  const verticalTravel = Math.abs(deltaY);
  const verticalStep = input.currentY - input.lastY;
  const thresholdExceeded =
    verticalTravel >= CLARITY_COMPOSER_TOUCH_INTENT_PX;
  const verticalDominant = verticalTravel > horizontalTravel;
  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
  const textareaScrollable =
    maxScrollTop > CLARITY_COMPOSER_SCROLL_EDGE_PX;
  const atTop = input.scrollTop <= CLARITY_COMPOSER_SCROLL_EDGE_PX;
  const atBottom =
    input.scrollTop >= maxScrollTop - CLARITY_COMPOSER_SCROLL_EDGE_PX;
  const textareaAtBoundary =
    !textareaScrollable ||
    (atTop && verticalStep > 0) ||
    (atBottom && verticalStep < 0);

  if (!thresholdExceeded) {
    return {
      contain: false,
      deltaX,
      deltaY,
      thresholdExceeded,
      verticalDominant,
      textareaScrollable,
      textareaAtBoundary,
      skipReason: "below-threshold",
    };
  }
  if (!verticalDominant) {
    return {
      contain: false,
      deltaX,
      deltaY,
      thresholdExceeded,
      verticalDominant,
      textareaScrollable,
      textareaAtBoundary,
      skipReason: "horizontal-dominant",
    };
  }
  if (verticalStep === 0) {
    return {
      contain: false,
      deltaX,
      deltaY,
      thresholdExceeded,
      verticalDominant,
      textareaScrollable,
      textareaAtBoundary,
      skipReason: "no-vertical-step",
    };
  }

  const contain =
    input.origin === "composer" ||
    !input.eventTargetsTextarea ||
    textareaAtBoundary;
  return {
    contain,
    deltaX,
    deltaY,
    thresholdExceeded,
    verticalDominant,
    textareaScrollable,
    textareaAtBoundary,
    skipReason: contain ? null : "textarea-can-scroll",
  };
}

export function shouldContainClarityComposerTouch(
  input: ClarityComposerTouchInput,
) {
  return resolveClarityComposerTouch(input).contain;
}

export function preventClarityComposerTouchDefault(
  event: Pick<Event, "cancelable" | "preventDefault">,
  contain: boolean,
) {
  if (!contain || !event.cancelable) return false;
  event.preventDefault();
  return true;
}
