export const calendarRecurrenceUnits = ["day", "week", "month", "year"] as const;

export type CalendarRecurrenceUnit = (typeof calendarRecurrenceUnits)[number];

export type CalendarRecurrenceRule = {
  unit: CalendarRecurrenceUnit | null;
  interval: number;
  weekdays: number[];
};

export type LegacyCalendarRecurrencePreset =
  | "none"
  | "daily"
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "yearly";

export function getIsoWeekday(localDate: string) {
  const date = new Date(`${localDate}T00:00:00Z`);
  const weekday = date.getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function normalizeCalendarRecurrenceRule(input: {
  recurrence: LegacyCalendarRecurrencePreset;
  localDate: string;
  recurrenceUnit?: CalendarRecurrenceUnit | null;
  recurrenceInterval?: number | null;
  recurrenceWeekdays?: readonly number[] | null;
}): CalendarRecurrenceRule {
  const fallback = legacyRule(input.recurrence, input.localDate);
  const unit = input.recurrenceUnit === undefined
    ? fallback.unit
    : input.recurrenceUnit;
  const interval = input.recurrenceInterval ?? fallback.interval;
  const weekdays = unit === "week"
    ? canonicalWeekdays(
        input.recurrenceWeekdays?.length
          ? input.recurrenceWeekdays
          : fallback.weekdays,
        input.localDate,
      )
    : [];
  return { unit, interval, weekdays };
}

export function getLegacyCalendarRecurrencePreset(
  rule: CalendarRecurrenceRule,
  localDate: string,
): LegacyCalendarRecurrencePreset {
  if (rule.unit === null) return "none";
  if (rule.unit === "day") return "daily";
  if (rule.unit === "month") return "monthly";
  if (rule.unit === "year") return "yearly";
  return rule.interval === 2 && isAnchorWeekday(rule.weekdays, localDate)
    ? "fortnightly"
    : "weekly";
}

export function isCustomCalendarRecurrence(
  rule: CalendarRecurrenceRule,
  localDate: string,
) {
  if (rule.unit === null) return false;
  return rule.interval !== 1 ||
    (rule.unit === "week" && !isAnchorWeekday(rule.weekdays, localDate));
}

export function formatCalendarRecurrenceSummary(
  rule: CalendarRecurrenceRule,
  localDate: string,
) {
  if (rule.unit === null) return "Doesn't repeat";
  if (!isCustomCalendarRecurrence(rule, localDate)) {
    if (rule.unit === "day") return "Daily";
    if (rule.unit === "week") return "Weekly";
    if (rule.unit === "month") return "Monthly";
    return "Yearly";
  }

  const unit = rule.interval === 1 ? rule.unit : `${rule.unit}s`;
  const interval = `Every ${rule.interval} ${unit}`;
  if (rule.unit !== "week") return interval;
  return `${interval} · ${formatWeekdays(rule.weekdays)}`;
}

export function occursOnCalendarDate(
  startDate: string,
  rule: CalendarRecurrenceRule,
  candidateDate: string,
) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const candidate = new Date(`${candidateDate}T00:00:00Z`);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(candidate.getTime()) ||
    candidate < start
  ) {
    return false;
  }
  if (rule.unit === null) return candidateDate === startDate;

  const dayDifference = Math.round(
    (candidate.getTime() - start.getTime()) / 86_400_000,
  );
  if (rule.unit === "day") return dayDifference % rule.interval === 0;

  if (rule.unit === "week") {
    const startWeek = new Date(start);
    startWeek.setUTCDate(start.getUTCDate() - (getIsoWeekday(startDate) - 1));
    const candidateWeek = new Date(candidate);
    candidateWeek.setUTCDate(
      candidate.getUTCDate() - (getIsoWeekday(candidateDate) - 1),
    );
    const weekDifference = Math.round(
      (candidateWeek.getTime() - startWeek.getTime()) / (7 * 86_400_000),
    );
    return weekDifference % rule.interval === 0 &&
      rule.weekdays.includes(getIsoWeekday(candidateDate));
  }

  if (rule.unit === "month") {
    const monthDifference =
      (candidate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      candidate.getUTCMonth() - start.getUTCMonth();
    return monthDifference % rule.interval === 0 &&
      candidate.getUTCDate() === start.getUTCDate();
  }

  const yearDifference = candidate.getUTCFullYear() - start.getUTCFullYear();
  return yearDifference % rule.interval === 0 &&
    candidate.getUTCMonth() === start.getUTCMonth() &&
    candidate.getUTCDate() === start.getUTCDate();
}

export function getNextCalendarOccurrence(
  startDate: string,
  rule: CalendarRecurrenceRule,
  onOrAfterDate: string,
) {
  const boundary = onOrAfterDate < startDate ? startDate : onOrAfterDate;
  if (rule.unit === null) return startDate >= boundary ? startDate : null;

  const start = new Date(`${startDate}T00:00:00Z`);
  const boundaryDate = new Date(`${boundary}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(boundaryDate.getTime())) {
    return null;
  }

  if (rule.unit === "day") {
    const difference = Math.round(
      (boundaryDate.getTime() - start.getTime()) / 86_400_000,
    );
    const steps = Math.max(0, Math.ceil(difference / rule.interval));
    return addUtcDays(start, steps * rule.interval);
  }

  if (rule.unit === "week") {
    const searchLimit = rule.interval * 7 + 7;
    for (let offset = 0; offset <= searchLimit; offset += 1) {
      const candidate = addUtcDays(boundaryDate, offset);
      if (occursOnCalendarDate(startDate, rule, candidate)) return candidate;
    }
    return null;
  }

  if (rule.unit === "month") {
    const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
    const boundaryMonth =
      boundaryDate.getUTCFullYear() * 12 + boundaryDate.getUTCMonth();
    let intervalIndex = Math.max(
      0,
      Math.floor((boundaryMonth - startMonth) / rule.interval),
    );
    for (let attempts = 0; attempts < 24; attempts += 1) {
      const monthIndex = startMonth + intervalIndex * rule.interval;
      const candidate = exactUtcDate(
        Math.floor(monthIndex / 12),
        monthIndex % 12,
        start.getUTCDate(),
      );
      if (candidate && candidate >= boundary) return candidate;
      intervalIndex += 1;
    }
    return null;
  }

  let intervalIndex = Math.max(
    0,
    Math.floor(
      (boundaryDate.getUTCFullYear() - start.getUTCFullYear()) / rule.interval,
    ),
  );
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const candidate = exactUtcDate(
      start.getUTCFullYear() + intervalIndex * rule.interval,
      start.getUTCMonth(),
      start.getUTCDate(),
    );
    if (candidate && candidate >= boundary) return candidate;
    intervalIndex += 1;
  }
  return null;
}

export function validateCalendarRecurrenceRule(rule: CalendarRecurrenceRule) {
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 999) {
    return "Repeat interval must be a whole number between 1 and 999.";
  }
  if (rule.unit === null) {
    return rule.interval === 1 && rule.weekdays.length === 0
      ? null
      : "A non-repeating commitment cannot have a repeat interval.";
  }
  if (rule.unit === "week") {
    if (rule.weekdays.length === 0) return "Choose at least one weekday.";
    if (
      new Set(rule.weekdays).size !== rule.weekdays.length ||
      rule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
    ) {
      return "Choose valid weekdays.";
    }
    return null;
  }
  return rule.weekdays.length === 0
    ? null
    : "Weekdays only apply to weekly recurrence.";
}

function legacyRule(
  recurrence: LegacyCalendarRecurrencePreset,
  localDate: string,
): CalendarRecurrenceRule {
  if (recurrence === "none") return { unit: null, interval: 1, weekdays: [] };
  if (recurrence === "daily") return { unit: "day", interval: 1, weekdays: [] };
  if (recurrence === "monthly") return { unit: "month", interval: 1, weekdays: [] };
  if (recurrence === "yearly") return { unit: "year", interval: 1, weekdays: [] };
  return {
    unit: "week",
    interval: recurrence === "fortnightly" ? 2 : 1,
    weekdays: [getIsoWeekday(localDate)],
  };
}

function canonicalWeekdays(values: readonly number[], localDate: string) {
  const valid = [...new Set(values)]
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
    .sort((left, right) => left - right);
  return valid.length > 0 ? valid : [getIsoWeekday(localDate)];
}

function isAnchorWeekday(weekdays: readonly number[], localDate: string) {
  return weekdays.length === 1 && weekdays[0] === getIsoWeekday(localDate);
}

function formatWeekdays(weekdays: readonly number[]) {
  const labels = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return weekdays.map((day) => labels[day]).filter(Boolean).join(", ");
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function exactUtcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}
