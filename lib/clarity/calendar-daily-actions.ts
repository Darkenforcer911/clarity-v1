import { formatScheduledTime } from "./date-time.ts";

export type CalendarDailyAction = {
  id: string;
  title: string;
  action_type: string;
  status: string;
  estimated_minutes: number;
  scheduled_time: string | null;
  completed_at: string | null;
  completion_evidence_only: boolean;
  actual_minutes: number | null;
  details: string | null;
  rescheduled_for: string | null;
  resolution_note: string | null;
  sort_order: number;
  approved_at: string | null;
  source_routine_id: string | null;
};

type CalendarDailyPlanWithActions = {
  status: string;
  approved_at: string | null;
  daily_actions: CalendarDailyAction[];
};

const acceptedPlanStatuses = new Set(["active", "closing", "closed"]);

export function getAcceptedCalendarDailyActions(
  plan: CalendarDailyPlanWithActions | null,
) {
  if (
    !plan ||
    !plan.approved_at ||
    !acceptedPlanStatuses.has(plan.status)
  ) {
    return [];
  }

  return plan.daily_actions
    .filter((action) => action.approved_at !== null)
    .sort((left, right) => left.sort_order - right.sort_order);
}

export function partitionCalendarDailyActions(
  actions: CalendarDailyAction[],
) {
  return {
    timed: actions.filter((action) => action.scheduled_time !== null),
    untimed: actions.filter((action) => action.scheduled_time === null),
  };
}

export function formatCalendarActionTimeRange(
  action: CalendarDailyAction,
  timezone: string,
) {
  if (!action.scheduled_time) return null;

  const start = formatScheduledTime(action.scheduled_time, timezone);
  const end = formatScheduledTime(
    new Date(
      new Date(action.scheduled_time).getTime() +
        action.estimated_minutes * 60_000,
    ).toISOString(),
    timezone,
  );

  return start && end ? `${start}–${end}` : start;
}

export function formatCalendarActionOutcome(
  action: CalendarDailyAction,
  timezone: string,
) {
  if (action.status === "completed") {
    const completionTime = formatScheduledTime(action.completed_at, timezone);
    return completionTime ? `Completed · ${completionTime}` : "Completed";
  }

  if (action.status === "missed") return "Didn't happen";
  if (action.status === "rescheduled") {
    return action.rescheduled_for
      ? `Moved to ${action.rescheduled_for}`
      : "Moved";
  }

  if (action.status === "dropped") {
    return action.resolution_note === "Removed from today"
      ? "Removed from today"
      : "No longer needed";
  }

  if (action.status === "removed") return "Removed";
  return null;
}
