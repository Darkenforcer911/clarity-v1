import {
  normalizeCalendarRecurrenceRule,
  occursOnCalendarDate as occursOnCalendarDateWithRule,
  type CalendarRecurrenceRule,
  type LegacyCalendarRecurrencePreset,
} from "./calendar-recurrence.ts";
import { addLocalDays } from "./date-time.ts";

export type { CalendarRecurrenceRule } from "./calendar-recurrence";

export function getCalendarDateMode(selectedDate: string, today: string) {
  if (selectedDate < today) return "past" as const;
  if (selectedDate > today) return "future" as const;
  return "today" as const;
}

export function resolveCalendarSelectedDate(
  requestedDate: string | undefined,
  profileLocalToday: string,
) {
  if (!requestedDate || !isValidCalendarDate(requestedDate)) {
    return profileLocalToday;
  }
  return requestedDate;
}

export function getCalendarStripDates(selectedDate: string) {
  return Array.from({ length: 7 }, (_, index) =>
    addLocalDays(selectedDate, index - 3),
  );
}

export function resolveCalendarCommitmentSelection(
  requestedCommitmentId: string | undefined,
  commitments: ReadonlyArray<{ id: string }>,
) {
  return requestedCommitmentId &&
    commitments.some((commitment) => commitment.id === requestedCommitmentId)
    ? requestedCommitmentId
    : null;
}

export function formatCommitmentTime(value: string | null) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = hour < 12 ? "am" : "pm";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function occursOnCalendarDate(
  startDate: string,
  recurrence: CalendarRecurrenceRule | LegacyCalendarRecurrencePreset,
  candidateDate: string,
) {
  const rule = typeof recurrence === "string"
    ? normalizeCalendarRecurrenceRule({ recurrence, localDate: startDate })
    : recurrence;
  return occursOnCalendarDateWithRule(startDate, rule, candidateDate);
}

function isValidCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}
