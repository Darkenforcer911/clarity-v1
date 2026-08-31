import { formatDuration } from "./duration.ts";

export { formatDuration } from "./duration.ts";

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
