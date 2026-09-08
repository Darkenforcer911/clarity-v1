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
