export function formatProposedPlanSummary(
  actionCount: number,
  totalMinutes: number,
  timedCount: number,
) {
  const segments = [
    `${actionCount} ${actionCount === 1 ? "action" : "actions"}`,
    formatDuration(totalMinutes),
  ];

  if (timedCount > 0) {
    segments.push(`${timedCount} timed`);
  }

  return segments.join(" · ");
}

export function formatDuration(totalMinutes: number) {
  const safeMinutes = Number.isFinite(totalMinutes)
    ? Math.max(0, Math.trunc(totalMinutes))
    : 0;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return minutes === 0
    ? `${hours} hr`
    : `${hours} hr ${minutes} min`;
}

export function canApproveProposedPlan(
  remainingActionCount: number,
  keepDayOpen: boolean,
) {
  return remainingActionCount > 0 || keepDayOpen;
}

export function shouldClearOpenDayConfirmation(
  previousActionCount: number,
  currentActionCount: number,
) {
  return previousActionCount === 0 && currentActionCount > 0;
}
