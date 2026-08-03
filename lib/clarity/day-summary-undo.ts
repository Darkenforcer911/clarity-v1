const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function hasRestorableDayCloseSnapshot(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  if (Array.isArray(value.preCloseActions)) {
    return value.preCloseActions.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        uuidPattern.test(item.id) &&
        (item.status === "active" || item.status === "completed"),
    );
  }

  if (Array.isArray(value.unfinishedActions)) {
    return value.unfinishedActions.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        uuidPattern.test(item.id),
    );
  }

  return false;
}

export function canOfferDaySummaryUndo({
  planStatus,
  planDate,
  currentLocalDate,
  snapshot,
}: {
  planStatus: string;
  planDate: string;
  currentLocalDate: string;
  snapshot: unknown;
}) {
  return (
    planStatus === "closed" &&
    planDate === currentLocalDate &&
    hasRestorableDayCloseSnapshot(snapshot)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
