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
  daily_plan_id: string | null;
  local_date: string;
  due_local_date: string | null;
  due_local_time: string | null;
  reminder_offsets_minutes: number[];
  calendar_projection?: "occurrence" | "due";
  original_input?: string | null;
};

export type CalendarDailyActionWithPlan = CalendarDailyAction & {
  daily_plans: {
    status: string;
    approved_at: string | null;
  } | null;
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

export function getVisibleCalendarDailyActions(
  rows: CalendarDailyActionWithPlan[],
  today: string,
) {
  return rows
    .filter((action) => {
      if (!action.daily_plans) {
        return action.local_date >= today && action.status === "proposed";
      }
      if (
        action.daily_plans.approved_at &&
        acceptedPlanStatuses.has(action.daily_plans.status) &&
        action.approved_at
      ) {
        return true;
      }
      return (
        action.local_date >= today &&
        action.daily_plans.status === "proposed" &&
        action.status === "proposed" &&
        (Boolean(action.original_input) || Boolean(action.source_routine_id))
      );
    })
    .map(({ daily_plans, ...action }) => {
      void daily_plans;
      return action;
    })
    .sort((left, right) => left.sort_order - right.sort_order);
}

export function partitionCalendarDailyActions(
  actions: CalendarDailyAction[],
) {
  return {
    due: actions.filter((action) => action.calendar_projection === "due"),
    timed: actions.filter(
      (action) =>
        action.calendar_projection !== "due" && action.scheduled_time !== null,
    ),
    untimed: actions.filter(
      (action) =>
        action.calendar_projection !== "due" && action.scheduled_time === null,
    ),
  };
}

export function formatCalendarActionDue(action: CalendarDailyAction) {
  if (action.calendar_projection !== "due" || !action.due_local_date) {
    return null;
  }
  if (!action.due_local_time) return "Due";
  const [hourText, minute] = action.due_local_time.slice(0, 5).split(":");
  const hour = Number(hourText);
  return `Due · ${hour % 12 || 12}:${minute} ${hour < 12 ? "am" : "pm"}`;
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
