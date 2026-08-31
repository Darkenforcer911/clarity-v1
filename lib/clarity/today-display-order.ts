import { localDateTimeToIso } from "./date-time.ts";

type TodayAction = {
  id: string;
  scheduled_time: string | null;
  sort_order: number;
};

type TodayCommitment = {
  id: string;
  commitment_type: "event" | "deadline";
  occurrence_date: string;
  event_start_time: string | null;
  deadline_due_time: string | null;
};

export type LaterTodayItem<
  Action extends TodayAction,
  Commitment extends TodayCommitment,
> =
  | { kind: "action"; value: Action }
  | { kind: "commitment"; value: Commitment };

export function partitionRemainingActions<Action extends TodayAction>(
  actions: readonly Action[],
  nextActionId: string | null,
) {
  const remaining = actions.filter((action) => action.id !== nextActionId);

  return {
    timed: remaining
      .filter((action) => action.scheduled_time !== null)
      .sort(compareActionTimes),
    untimed: remaining
      .filter((action) => action.scheduled_time === null)
      .sort((left, right) => left.sort_order - right.sort_order),
  };
}

export function orderLaterTodayItems<
  Action extends TodayAction,
  Commitment extends TodayCommitment,
>({
  actions,
  commitments,
  timezone,
}: {
  actions: readonly Action[];
  commitments: readonly Commitment[];
  timezone: string;
}): LaterTodayItem<Action, Commitment>[] {
  return [
    ...actions.map((value) => ({ kind: "action" as const, value })),
    ...commitments.map((value) => ({ kind: "commitment" as const, value })),
  ].sort((left, right) => {
    const leftTime = itemTime(left, timezone);
    const rightTime = itemTime(right, timezone);
    const timeDifference = leftTime - rightTime;

    if (leftTime !== rightTime) return timeDifference;
    if (left.kind === "action" && right.kind === "action") {
      return left.value.sort_order - right.value.sort_order;
    }
    return left.value.id.localeCompare(right.value.id);
  });
}

function itemTime<Action extends TodayAction, Commitment extends TodayCommitment>(
  item: LaterTodayItem<Action, Commitment>,
  timezone: string,
) {
  if (item.kind === "action") {
    if (!item.value.scheduled_time) return Number.POSITIVE_INFINITY;
    const value = new Date(item.value.scheduled_time).getTime();
    return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
  }

  const storedTime =
    item.value.commitment_type === "event"
      ? item.value.event_start_time
      : item.value.deadline_due_time;
  if (!storedTime) return Number.POSITIVE_INFINITY;

  try {
    return new Date(
      localDateTimeToIso(
        item.value.occurrence_date,
        storedTime.slice(0, 5),
        timezone,
      ),
    ).getTime();
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function compareActionTimes(left: TodayAction, right: TodayAction) {
  const leftTime = left.scheduled_time
    ? new Date(left.scheduled_time).getTime()
    : Number.POSITIVE_INFINITY;
  const rightTime = right.scheduled_time
    ? new Date(right.scheduled_time).getTime()
    : Number.POSITIVE_INFINITY;
  return leftTime - rightTime || left.sort_order - right.sort_order;
}
