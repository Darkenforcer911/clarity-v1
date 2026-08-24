export function resolveActionTimingFromOptionalTime(value: string) {
  const scheduledTime = value.trim();

  return scheduledTime
    ? { actionType: "fixed" as const, scheduledTime }
    : { actionType: "flexible" as const, scheduledTime: "" };
}

export function hasOptionalActionTime(value: string | null | undefined) {
  return Boolean(value?.trim());
}
