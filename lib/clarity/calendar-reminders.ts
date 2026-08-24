import { isReminderScheduleFuture } from "./calendar-reminder-schedule.ts";
import { addLocalDays, getLocalDate } from "./date-time.ts";
import {
  getNextCalendarOccurrence,
  normalizeCalendarRecurrenceRule,
  type CalendarRecurrenceRule,
  type LegacyCalendarRecurrencePreset,
} from "./calendar-recurrence.ts";

export const REMINDER_PRESETS = [0, 30, 120, 1440] as const;
export const MAX_REMINDER_COUNT = 10;
export const MAX_REMINDER_OFFSET_MINUTES = 43_200;

export type ReminderCommitmentKind =
  | "event"
  | "timed_deadline"
  | "date_only_deadline";

export type ReminderValidationResult =
  | { success: true; offsets: number[] }
  | { success: false; error: string };

export type ReminderScheduleContext = {
  occurrenceDate: string;
  wallClockTime: string | null;
  timezone: string;
  now: Date;
  recurrence?: LegacyCalendarRecurrencePreset;
  recurrenceRule?: CalendarRecurrenceRule;
};

export const REMINDER_TIME_PASSED_ERROR =
  "That reminder time has already passed. Choose a reminder closer to the event.";

export function getReminderCommitmentKind(
  commitmentType: "event" | "deadline",
  hasExactDeadlineTime: boolean,
): ReminderCommitmentKind {
  if (commitmentType === "event") return "event";
  return hasExactDeadlineTime ? "timed_deadline" : "date_only_deadline";
}

export function getDefaultReminderOffsets(kind: ReminderCommitmentKind) {
  return kind === "event" ? [0] : [1440];
}

export function getAllowedReminderPresets(kind: ReminderCommitmentKind) {
  return kind === "date_only_deadline" ? [1440] : [...REMINDER_PRESETS];
}

export function isReminderOffsetAvailable(
  kind: ReminderCommitmentKind,
  offset: number,
  context: ReminderScheduleContext,
) {
  if (!context.occurrenceDate) return true;
  if (kind !== "date_only_deadline" && !context.wallClockTime) return true;
  const recurrence = context.recurrence ?? "none";
  const recurrenceRule = context.recurrenceRule ??
    normalizeCalendarRecurrenceRule({
      recurrence,
      localDate: context.occurrenceDate,
    });
  const firstCandidate =
    recurrenceRule.unit === null ||
    context.occurrenceDate >= getLocalDate(context.timezone, context.now)
      ? context.occurrenceDate
      : getLocalDate(context.timezone, context.now);
  let occurrenceDate = getNextCalendarOccurrence(
    context.occurrenceDate,
    recurrenceRule,
    firstCandidate,
  );

  const maximumOccurrenceAttempts =
    Math.ceil(MAX_REMINDER_OFFSET_MINUTES / 1440) + 2;
  for (
    let attempt = 0;
    occurrenceDate && attempt < maximumOccurrenceAttempts;
    attempt += 1
  ) {
    try {
      if (
        isReminderScheduleFuture(
          {
            commitmentType: kind === "event" ? "event" : "deadline",
            occurrenceDate,
            wallClockTime:
              kind === "date_only_deadline" ? null : context.wallClockTime,
            timezone: context.timezone,
            reminderOffsetMinutes: offset,
          },
          context.now,
        )
      ) {
        return true;
      }
    } catch {
      // A DST-skipped occurrence may be invalid while a later recurrence is valid.
    }
    occurrenceDate = recurrenceRule.unit === null
      ? null
      : getNextCalendarOccurrence(
          context.occurrenceDate,
          recurrenceRule,
          addLocalDays(occurrenceDate, 1),
        );
  }

  return false;
}

export function getAvailableReminderPresets(
  kind: ReminderCommitmentKind,
  context: ReminderScheduleContext,
) {
  return getAllowedReminderPresets(kind).filter((offset) =>
    isReminderOffsetAvailable(kind, offset, context),
  );
}

export function getDefaultAvailableReminderOffsets(
  kind: ReminderCommitmentKind,
  context: ReminderScheduleContext,
) {
  const available = getAvailableReminderPresets(kind, context);
  if (kind === "event") {
    return available.includes(0) ? [0] : [];
  }
  const priority = kind === "timed_deadline"
    ? [1440, 120, 30, 0]
    : [1440];
  const selected = priority.find((offset) => available.includes(offset));
  return selected === undefined ? [] : [selected];
}

export function validateReminderSchedule(
  values: readonly number[],
  kind: ReminderCommitmentKind,
  context: ReminderScheduleContext,
): ReminderValidationResult {
  const offsets = validateReminderOffsets(values, kind);
  if (!offsets.success) return offsets;
  if (
    offsets.offsets.some(
      (offset) => !isReminderOffsetAvailable(kind, offset, context),
    )
  ) {
    return { success: false, error: REMINDER_TIME_PASSED_ERROR };
  }
  return offsets;
}

export function validateReminderOffsets(
  values: readonly number[],
  kind: ReminderCommitmentKind,
): ReminderValidationResult {
  if (values.length > 1) {
    return {
      success: false,
      error: "Choose one reminder.",
    };
  }

  const seen = new Set<number>();
  for (const value of values) {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      (kind === "date_only_deadline" && value === 0)
    ) {
      return {
        success: false,
        error:
          kind === "date_only_deadline"
            ? "Date-only deadlines require a reminder before the due date."
            : "Reminder offsets must be non-negative whole minutes.",
      };
    }
    if (value > MAX_REMINDER_OFFSET_MINUTES) {
      return { success: false, error: "A reminder cannot be more than 30 days before." };
    }
    if (seen.has(value)) {
      return { success: false, error: "Each reminder offset must be unique." };
    }
    if (kind === "date_only_deadline" && value % 1440 !== 0) {
      return {
        success: false,
        error: "Date-only deadlines support whole-day reminders only.",
      };
    }
    seen.add(value);
  }

  return { success: true, offsets: [...values].sort((a, b) => b - a) };
}

export function canonicalizeReminderOffsets(
  values: readonly number[],
  kind: ReminderCommitmentKind,
) {
  const unique = [...new Set(values)].filter(
    (value) =>
      Number.isSafeInteger(value) &&
      (kind === "date_only_deadline" ? value > 0 : value >= 0) &&
      value <= MAX_REMINDER_OFFSET_MINUTES &&
      (kind !== "date_only_deadline" || value % 1440 === 0),
  );
  return unique.sort((a, b) => b - a).slice(0, MAX_REMINDER_COUNT);
}

export function preserveReminderOffsets(
  values: readonly number[],
  nextKind: ReminderCommitmentKind,
) {
  return canonicalizeReminderOffsets(values, nextKind);
}

export function normalizeSingleReminderOffsets(
  values: readonly number[],
  kind: ReminderCommitmentKind,
) {
  const compatibleOffsets = preserveReminderOffsets(values, kind);
  const closestOffset = compatibleOffsets.at(-1);
  return closestOffset === undefined ? [] : [closestOffset];
}

export function selectSingleReminderOffset(offset: number) {
  return [offset];
}

export function customReminderToMinutes(
  amount: number,
  unit: "minutes" | "hours" | "days",
) {
  const maximum = unit === "minutes" ? 59 : unit === "hours" ? 23 : 30;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum) {
    return null;
  }
  const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
  const result = amount * multiplier;
  return result <= MAX_REMINDER_OFFSET_MINUTES ? result : null;
}

export function formatReminderOffset(minutes: number) {
  if (minutes === 0) return "At start time";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"} before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"} before`;
  }
  return `${minutes} min before`;
}

export function formatCustomReminderOffset(minutes: number) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"} before`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return [
      `${hours} hr`,
      remainingMinutes > 0 ? `${remainingMinutes} min` : null,
      "before",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} before`;
}
