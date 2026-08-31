import { z } from "zod";

import { normalizeCalendarCommitmentReadModel } from "./calendar-commitment-read-model";
import {
  getLocalDate,
  getLocalTime,
  localDateTimeToIso,
} from "./date-time";
import { formatDuration } from "./duration";
import {
  calendarRecurrenceUnits,
  formatCalendarRecurrenceSummary,
  normalizeCalendarRecurrenceRule,
  type CalendarRecurrenceRule,
} from "./calendar-recurrence.ts";
export {
  formatCommitmentTime,
  occursOnCalendarDate,
} from "./calendar-rules";
import { formatCommitmentTime } from "./calendar-rules";
export {
  formatCalendarOutcomeLabel,
  formatCalendarOutcomeStatus,
} from "./calendar-occurrence-presentation";

export const calendarCommitmentTypes = ["event", "deadline"] as const;
export const calendarCommitmentStatuses = [
  "scheduled",
  "completed",
  "missed",
  "cancelled",
] as const;
export const calendarRecurrencePresets = [
  "none",
  "daily",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
] as const;
export const calendarEventOutcomes = [
  "attended",
  "missed",
  "cancelled",
  "rescheduled",
] as const;

export type CalendarCommitmentType =
  (typeof calendarCommitmentTypes)[number];
export type CalendarCommitmentStatus =
  (typeof calendarCommitmentStatuses)[number];
export type CalendarRecurrencePreset =
  (typeof calendarRecurrencePresets)[number];
export type CalendarEventOutcome =
  (typeof calendarEventOutcomes)[number];

const calendarCommitmentSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  commitment_type: z.enum(calendarCommitmentTypes),
  title: z.string(),
  local_date: z.iso.date(),
  event_start_time: z.string().nullable(),
  deadline_due_time: z.string().nullable(),
  duration_minutes: z.number().int().nullable(),
  recurrence: z.enum(calendarRecurrencePresets),
  recurrence_unit: z.enum(calendarRecurrenceUnits).nullable(),
  recurrence_interval: z.number().int().min(1).max(999),
  recurrence_weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  details: z.string().nullable(),
  status: z.enum(calendarCommitmentStatuses),
  timezone: z.string(),
  reminder_offsets_minutes: z.array(z.number().int()),
  rescheduled_from_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  occurrence_date: z.iso.date(),
  reconciliation_outcome: z.enum(calendarEventOutcomes).nullable().optional(),
  outcome_note: z.string().nullable().optional(),
  replacement_commitment_id: z.string().uuid().nullable().optional(),
  occurrence_id: z.string().uuid().nullable().optional(),
  outcome_recorded_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  can_undo_completion: z.boolean(),
});

export type CalendarCommitment = z.infer<typeof calendarCommitmentSchema>;

export function parseCalendarCommitments(value: unknown) {
  return z
    .array(calendarCommitmentSchema)
    .parse(normalizeCalendarCommitmentReadModel(value));
}

export function getCalendarCommitmentRecurrenceRule(
  commitment: Pick<
    CalendarCommitment,
    "recurrence" | "recurrence_unit" | "recurrence_interval" | "recurrence_weekdays" | "local_date"
  >,
): CalendarRecurrenceRule {
  return normalizeCalendarRecurrenceRule({
    recurrence: commitment.recurrence,
    localDate: commitment.local_date,
    recurrenceUnit: commitment.recurrence_unit,
    recurrenceInterval: commitment.recurrence_interval,
    recurrenceWeekdays: commitment.recurrence_weekdays,
  });
}

export function formatCommitmentRecurrence(
  commitment: Pick<
    CalendarCommitment,
    "recurrence" | "recurrence_unit" | "recurrence_interval" | "recurrence_weekdays" | "local_date"
  >,
) {
  const rule = getCalendarCommitmentRecurrenceRule(commitment);
  return rule.unit
    ? formatCalendarRecurrenceSummary(rule, commitment.local_date)
    : null;
}

export function getCommitmentTime(commitment: CalendarCommitment) {
  return commitment.commitment_type === "event"
    ? commitment.event_start_time
    : commitment.deadline_due_time;
}

export function getCommitmentTimingState(
  commitment: CalendarCommitment,
  timezone: string,
  now = new Date(),
) {
  if (commitment.reconciliation_outcome) {
    return commitment.reconciliation_outcome;
  }
  if (commitment.status !== "scheduled") return commitment.status;

  const time = getCommitmentTime(commitment);
  if (!time || getLocalDate(timezone, now) !== commitment.occurrence_date) {
    return "scheduled" as const;
  }

  const wallClock = time.slice(0, 5);
  const commitmentMinute = Math.floor(
    new Date(
      localDateTimeToIso(commitment.occurrence_date, wallClock, timezone),
    ).getTime() / 60_000,
  );
  const currentMinute = Math.floor(now.getTime() / 60_000);

  if (commitmentMinute >= currentMinute) return "scheduled" as const;
  return commitment.commitment_type === "event"
    ? ("time_passed" as const)
    : ("overdue" as const);
}

export function isCalendarEventReconciliationCandidate(
  commitment: CalendarCommitment,
  timezone: string,
  now = new Date(),
) {
  if (commitment.commitment_type !== "event") return false;
  if (commitment.reconciliation_outcome) return true;
  return getCommitmentTimingState(commitment, timezone, now) === "time_passed";
}

export function sortCalendarCommitments(
  commitments: CalendarCommitment[],
) {
  return [...commitments].sort((left, right) => {
    const leftTime = getCommitmentTime(left) ?? "99:99";
    const rightTime = getCommitmentTime(right) ?? "99:99";
    return (
      leftTime.localeCompare(rightTime) ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id)
    );
  });
}

export function getCommitmentMeta(commitment: CalendarCommitment) {
  const time = formatCommitmentTime(getCommitmentTime(commitment));
  const duration = commitment.duration_minutes
    ? formatDuration(commitment.duration_minutes)
    : null;
  return [time, duration].filter(Boolean).join(" · ");
}

export function getProfileLocalMinute(timezone: string, now = new Date()) {
  return `${getLocalDate(timezone, now)}T${getLocalTime(timezone, now)}`;
}
