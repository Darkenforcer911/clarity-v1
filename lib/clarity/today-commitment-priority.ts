import type { CalendarCommitment } from "./calendar-commitments";
import { localDateTimeToIso } from "./date-time.ts";

export const MINIMUM_COMMITMENT_ATTENTION_WINDOW_MINUTES = 30;

export function partitionTodayCommitmentsForAttention({
  commitments,
  localDate,
  timezone,
  now,
  nextActionDurationMinutes,
}: {
  commitments: CalendarCommitment[];
  localDate: string;
  timezone: string;
  now: Date;
  nextActionDurationMinutes: number | null;
}) {
  const attentionWindowMinutes = Math.max(
    MINIMUM_COMMITMENT_ATTENTION_WINDOW_MINUTES,
    nextActionDurationMinutes ?? 0,
  );
  const approaching: CalendarCommitment[] = [];
  const later: CalendarCommitment[] = [];

  for (const commitment of commitments) {
    const minutesUntil = minutesUntilCommitment(
      commitment,
      localDate,
      timezone,
      now,
    );

    if (
      isUnresolvedCommitment(commitment) &&
      minutesUntil !== null &&
      minutesUntil <= attentionWindowMinutes
    ) {
      approaching.push(commitment);
    } else {
      later.push(commitment);
    }
  }

  return { approaching, later, attentionWindowMinutes };
}

export function getLaterCommitmentsHeading({
  commitments,
  localDate,
  timezone,
  now,
}: {
  commitments: CalendarCommitment[];
  localDate: string;
  timezone: string;
  now: Date;
}) {
  const allStillAhead = commitments.every((commitment) => {
    const minutesUntil = minutesUntilCommitment(
      commitment,
      localDate,
      timezone,
      now,
    );
    return (
      isUnresolvedCommitment(commitment) &&
      minutesUntil !== null &&
      minutesUntil > 0
    );
  });

  return allStillAhead ? "Later today" : "Today's commitments";
}

function isUnresolvedCommitment(commitment: CalendarCommitment) {
  return (
    commitment.status === "scheduled" &&
    !commitment.reconciliation_outcome
  );
}

function minutesUntilCommitment(
  commitment: CalendarCommitment,
  localDate: string,
  timezone: string,
  now: Date,
) {
  const storedTime =
    commitment.commitment_type === "event"
      ? commitment.event_start_time
      : commitment.deadline_due_time;

  if (!storedTime || commitment.occurrence_date !== localDate) {
    return null;
  }

  try {
    const scheduledAt = new Date(
      localDateTimeToIso(localDate, storedTime.slice(0, 5), timezone),
    );
    return Math.floor(
      (scheduledAt.getTime() - now.getTime()) / 60_000,
    );
  } catch {
    return null;
  }
}
