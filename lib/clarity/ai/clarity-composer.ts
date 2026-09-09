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

export function shouldContainClarityComposerTouch(input: {
  startX: number;
  startY: number;
  lastY: number;
  currentX: number;
  currentY: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  eventTargetsTextarea: boolean;
}) {
  const horizontalTravel = Math.abs(input.currentX - input.startX);
  const verticalTravel = Math.abs(input.currentY - input.startY);
  const verticalStep = input.currentY - input.lastY;

  if (
    verticalTravel < CLARITY_COMPOSER_TOUCH_INTENT_PX ||
    verticalTravel <= horizontalTravel ||
    verticalStep === 0
  ) {
    return false;
  }

  if (!input.eventTargetsTextarea) return true;

  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
  if (maxScrollTop <= CLARITY_COMPOSER_SCROLL_EDGE_PX) return true;

  const atTop = input.scrollTop <= CLARITY_COMPOSER_SCROLL_EDGE_PX;
  const atBottom =
    input.scrollTop >= maxScrollTop - CLARITY_COMPOSER_SCROLL_EDGE_PX;

  return (atTop && verticalStep > 0) || (atBottom && verticalStep < 0);
}
