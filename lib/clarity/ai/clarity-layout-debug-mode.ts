export const CLARITY_LAYOUT_DEBUG_STORAGE_KEY =
  "clarity:layout-debug-enabled";
export const CLARITY_LAYOUT_DEBUG_ACTIVATION_TAPS = 7;
export const CLARITY_LAYOUT_DEBUG_ACTIVATION_WINDOW_MS = 4_000;

export function isClarityStandaloneRuntime(input: {
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
}) {
  return input.displayModeStandalone || input.navigatorStandalone;
}

export function shouldEnableClarityLayoutDebug(input: {
  queryEnabled: boolean;
  standalone: boolean;
  persistedValue: string | null;
}) {
  return (
    input.queryEnabled ||
    (input.standalone && input.persistedValue === "1")
  );
}

export function recordClarityLayoutDebugTap(
  previousTimestamps: readonly number[],
  now: number,
) {
  const recentTimestamps = previousTimestamps.filter(
    (timestamp) =>
      now - timestamp <= CLARITY_LAYOUT_DEBUG_ACTIVATION_WINDOW_MS,
  );
  const nextTimestamps = [...recentTimestamps, now];
  const activate =
    nextTimestamps.length >= CLARITY_LAYOUT_DEBUG_ACTIVATION_TAPS;

  return {
    activate,
    timestamps: activate ? [] : nextTimestamps,
  };
}
