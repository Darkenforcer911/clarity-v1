import {
  normalizeCalendarRecurrenceRule,
  type CalendarRecurrenceUnit,
  type LegacyCalendarRecurrencePreset,
} from "./calendar-recurrence.ts";

export function normalizeCalendarCommitmentReadModel(value: unknown) {
  if (!Array.isArray(value)) return value;

  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return entry;
    }

    const record = entry as Record<string, unknown>;
    const recurrence = record.recurrence as LegacyCalendarRecurrencePreset;
    const localDate = record.local_date as string;
    const hasLegacyRecurrence =
      typeof record.recurrence === "string" &&
      typeof record.local_date === "string";
    const hasCanonicalRecurrence =
      record.recurrence_unit !== undefined &&
      record.recurrence_interval !== undefined &&
      record.recurrence_weekdays !== undefined;
    const recurrenceRule = hasCanonicalRecurrence || !hasLegacyRecurrence
      ? null
      : normalizeCalendarRecurrenceRule({
          recurrence,
          localDate,
          recurrenceUnit: record.recurrence_unit as CalendarRecurrenceUnit | null | undefined,
          recurrenceInterval: record.recurrence_interval as number | null | undefined,
          recurrenceWeekdays: record.recurrence_weekdays as number[] | null | undefined,
        });
    const recurrenceFields = recurrenceRule
      ? {
          recurrence_unit: recurrenceRule.unit,
          recurrence_interval: recurrenceRule.interval,
          recurrence_weekdays: recurrenceRule.weekdays,
        }
      : {};
    const normalizedStatus =
      typeof record.occurrence_id === "string" &&
      record.reconciliation_outcome === null
        ? "scheduled"
        : record.status;
    if (
      record.can_undo_completion !== null &&
      record.can_undo_completion !== undefined
    ) {
      return normalizedStatus === record.status
        ? recurrenceRule ? { ...record, ...recurrenceFields } : entry
        : { ...record, ...recurrenceFields, status: normalizedStatus };
    }

    const normalized = {
      ...record,
      ...recurrenceFields,
      can_undo_completion: false,
    };
    return normalizedStatus === record.status
      ? normalized
      : { ...normalized, status: normalizedStatus };
  });
}
