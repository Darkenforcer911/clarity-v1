export type SchedulableActiveAction = {
  scheduled_time: string | null;
  estimated_minutes: number;
  sort_order: number;
};

export type ActiveActionTiming =
  | { kind: "flexible" }
  | {
      kind: "overdue" | "now" | "future";
      scheduledMinute: number;
      minutesFromNow: number;
    };

export const ACTIVE_ACTION_COMING_UP_WINDOW_MINUTES = 30;

const localDateFormatters = new Map<string, Intl.DateTimeFormat>();

export function selectNextActiveAction<
  Action extends SchedulableActiveAction,
>(
  actions: Action[],
  planLocalDate: string,
  timezone: string,
  now: Date,
) {
  if (actions.length === 0) {
    return undefined;
  }

  const ordered = [...actions].sort(
    (left, right) => left.sort_order - right.sort_order,
  );
  const currentMinute = minuteValue(now);
  const timed = ordered
    .map((action) => ({
      action,
      scheduledMinute: scheduledMinuteFor(
        action,
        planLocalDate,
        timezone,
      ),
    }))
    .filter(
      (
        item,
      ): item is { action: Action; scheduledMinute: number } =>
        item.scheduledMinute !== null,
    );
  const overdue = timed
    .filter((item) => item.scheduledMinute < currentMinute)
    .sort(compareTimedActions);

  if (overdue[0]) {
    return overdue[0].action;
  }

  const nextTimed = timed
    .filter((item) => item.scheduledMinute >= currentMinute)
    .sort(compareTimedActions)[0];
  const timedActions = new Set(timed.map((item) => item.action));
  const flexible = ordered.filter((action) => !timedActions.has(action));

  if (!nextTimed) {
    return flexible[0];
  }

  const availableMinutes = nextTimed.scheduledMinute - currentMinute;
  const fittingFlexibleAction = flexible.find(
    (action) => action.estimated_minutes <= availableMinutes,
  );

  if (fittingFlexibleAction) return fittingFlexibleAction;
  if (availableMinutes <= ACTIVE_ACTION_COMING_UP_WINDOW_MINUTES) {
    return nextTimed.action;
  }
  return flexible[0];
}

export function getActiveActionTiming(
  action: SchedulableActiveAction,
  planLocalDate: string,
  timezone: string,
  now: Date,
): ActiveActionTiming {
  const scheduledMinute = scheduledMinuteFor(
    action,
    planLocalDate,
    timezone,
  );

  if (scheduledMinute === null) {
    return { kind: "flexible" };
  }

  const difference = scheduledMinute - minuteValue(now);

  if (difference < 0) {
    return {
      kind: "overdue",
      scheduledMinute,
      minutesFromNow: Math.abs(difference),
    };
  }

  return {
    kind: difference === 0 ? "now" : "future",
    scheduledMinute,
    minutesFromNow: difference,
  };
}

function scheduledMinuteFor(
  action: SchedulableActiveAction,
  planLocalDate: string,
  timezone: string,
) {
  if (!action.scheduled_time) {
    return null;
  }

  const storedTime = new Date(action.scheduled_time);

  if (Number.isNaN(storedTime.getTime())) {
    return null;
  }

  if (localDateFor(storedTime, timezone) !== planLocalDate) {
    return null;
  }

  return minuteValue(storedTime);
}

function compareTimedActions<
  Action extends SchedulableActiveAction,
>(
  left: { action: Action; scheduledMinute: number },
  right: { action: Action; scheduledMinute: number },
) {
  return (
    left.scheduledMinute - right.scheduledMinute ||
    left.action.sort_order - right.action.sort_order
  );
}

function minuteValue(value: Date) {
  return Math.floor(value.getTime() / 60_000);
}

function localDateFor(value: Date, timezone: string) {
  let formatter = localDateFormatters.get(timezone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    localDateFormatters.set(timezone, formatter);
  }

  const parts = formatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}
