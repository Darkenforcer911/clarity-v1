import type {
  CalendarCommitmentType,
} from "./calendar-commitments";
import type { RecurrencePrimaryChoice } from "./recurrence-ui";
import {
  formatCalendarRecurrenceSummary,
  getIsoWeekday,
  isCustomCalendarRecurrence,
  type CalendarRecurrenceRule,
} from "./calendar-recurrence.ts";
import {
  REMINDER_PRESETS,
  formatCustomReminderOffset,
  formatReminderOffset,
} from "./calendar-reminders.ts";
import { formatDuration } from "./duration.ts";

const commitmentKindPresentation: Record<
  CalendarCommitmentType,
  { label: string; choiceDescription: string; summary: string }
> = {
  event: {
    label: "Event",
    choiceDescription: "Something that happens at a specific time",
    summary: "Event · happens at a set time",
  },
  deadline: {
    label: "Deadline",
    choiceDescription: "Something that must be done by a date or time",
    summary: "Deadline · due by a date/time",
  },
};

export function getCommitmentKindPresentation(
  kind: CalendarCommitmentType,
) {
  return commitmentKindPresentation[kind];
}

export function formatReminderSummary(offsets: readonly number[]) {
  const offset = offsets.at(-1);
  if (offset === undefined) return "None";
  return (REMINDER_PRESETS as readonly number[]).includes(offset)
    ? formatReminderOffset(offset)
    : formatCustomReminderOffset(offset);
}

export function formatRecurrenceSummary(
  rule: CalendarRecurrenceRule,
  localDate: string,
) {
  return formatCalendarRecurrenceSummary(rule, localDate);
}

export function getCalendarRecurrencePrimaryChoice(
  rule: CalendarRecurrenceRule,
  localDate: string,
): RecurrencePrimaryChoice {
  if (rule.unit === null) return "none";
  if (isCustomCalendarRecurrence(rule, localDate)) return "custom";
  if (rule.unit === "day") return "daily";
  if (rule.unit === "week") return "weekly";
  return rule.unit === "month" ? "monthly" : "yearly";
}

export function resolveCalendarRecurrencePrimaryChoice(
  choice: RecurrencePrimaryChoice,
  current: CalendarRecurrenceRule,
  localDate: string,
): CalendarRecurrenceRule {
  if (choice === "none") return { unit: null, interval: 1, weekdays: [] };
  if (choice === "daily") return { unit: "day", interval: 1, weekdays: [] };
  if (choice === "weekly") {
    return { unit: "week", interval: 1, weekdays: [getIsoWeekday(localDate)] };
  }
  if (choice === "monthly") return { unit: "month", interval: 1, weekdays: [] };
  if (choice === "yearly") return { unit: "year", interval: 1, weekdays: [] };
  return isCustomCalendarRecurrence(current, localDate)
    ? current
    : { unit: "week", interval: 2, weekdays: [getIsoWeekday(localDate)] };
}

export function formatEventDurationSummary(
  hoursValue: string,
  minutesValue: string,
) {
  const hoursText = hoursValue || "0";
  const minutesText = minutesValue || "0";
  if (!/^\d+$/.test(hoursText) || !/^\d+$/.test(minutesText)) {
    return "Check duration";
  }
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (minutes > 59) return "Check duration";
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes > 0 ? formatDuration(totalMinutes) : "Not set";
}
