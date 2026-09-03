import {
  hasScheduledMinutePassed,
  localDateTimeToIso,
} from "./date-time.ts";

type ShapeTodayAction = {
  scheduled_time: string | null;
};

type ShapeTodayCommitment = {
  commitment_type: "event" | "deadline";
  occurrence_date: string;
  event_start_time: string | null;
  deadline_due_time: string | null;
  status: string;
  reconciliation_outcome?: string | null;
};

export function partitionShapeTodayItems<
  Action extends ShapeTodayAction,
  Commitment extends ShapeTodayCommitment,
>({
  actions,
  commitments,
  localDate,
  timezone,
  now,
}: {
  actions: readonly Action[];
  commitments: readonly Commitment[];
  localDate: string;
  timezone: string;
  now: Date;
}) {
  const unresolvedCommitments = commitments.filter(
    (commitment) =>
      commitment.status === "scheduled" &&
      !commitment.reconciliation_outcome &&
      getShapeTodayCommitmentTime(commitment) !== null,
  );

  return {
    earlierActions: actions.filter(
      (action) =>
        action.scheduled_time !== null &&
        hasScheduledMinutePassed(
          action.scheduled_time,
          localDate,
          timezone,
          now,
        ),
    ),
    fixedActions: actions.filter(
      (action) =>
        action.scheduled_time !== null &&
        !hasScheduledMinutePassed(
          action.scheduled_time,
          localDate,
          timezone,
          now,
        ),
    ),
    flexibleActions: actions.filter(
      (action) => action.scheduled_time === null,
    ),
    earlierCommitments: unresolvedCommitments.filter((commitment) =>
      hasCommitmentTimePassed(commitment, timezone, now),
    ),
    fixedCommitments: unresolvedCommitments.filter(
      (commitment) => !hasCommitmentTimePassed(commitment, timezone, now),
    ),
  };
}

function getShapeTodayCommitmentTime(commitment: ShapeTodayCommitment) {
  return commitment.commitment_type === "event"
    ? commitment.event_start_time
    : commitment.deadline_due_time;
}

function hasCommitmentTimePassed(
  commitment: ShapeTodayCommitment,
  timezone: string,
  now: Date,
) {
  const time = getShapeTodayCommitmentTime(commitment);
  if (!time) return false;

  const scheduledMinute = Math.floor(
    new Date(
      localDateTimeToIso(commitment.occurrence_date, time.slice(0, 5), timezone),
    ).getTime() / 60_000,
  );
  return scheduledMinute < Math.floor(now.getTime() / 60_000);
}
