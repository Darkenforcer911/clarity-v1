export type ReturnGapActionBoundary = {
  status: string;
  approvedAt: string | null;
};

export function isReturnGapBlockingAction(
  action: ReturnGapActionBoundary,
) {
  return action.approvedAt !== null || action.status === "active";
}

export function isHistoricalReturnGapDate(
  localDate: string,
  currentLocalDate: string,
) {
  return localDate < currentLocalDate;
}
