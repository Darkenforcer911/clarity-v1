import { z } from "zod";

import {
  calendarCommitmentTypes,
  calendarRecurrencePresets,
  type CalendarCommitmentType,
} from "./calendar-commitments";
import type { CalendarCommitmentInput } from "./calendar-service";
import {
  getReminderCommitmentKind,
  validateReminderOffsets,
} from "./calendar-reminders";
import {
  calendarRecurrenceUnits,
  getLegacyCalendarRecurrencePreset,
  validateCalendarRecurrenceRule,
  type CalendarRecurrenceRule,
} from "./calendar-recurrence.ts";

const wholeNumber = /^\d+$/;

const calendarFormSchema = z.object({
  commitmentType: z.enum(calendarCommitmentTypes),
  title: z.string().trim().min(1, "Enter a title.").max(200),
  localDate: z.iso.date("Choose a valid date."),
  eventStartTime: z.string(),
  deadlineDueTime: z.string(),
  noExactTime: z.boolean(),
  durationHours: z.string(),
  durationMinutes: z.string(),
  recurrence: z.enum(calendarRecurrencePresets),
  recurrenceUnit: z.union([z.enum(calendarRecurrenceUnits), z.literal("")]),
  recurrenceInterval: z.string(),
  recurrenceWeekdays: z.array(z.coerce.number()),
  details: z.string().max(2000, "Details are too long."),
});

export function parseCalendarCommitmentForm(formData: FormData):
  | { success: true; data: CalendarCommitmentInput }
  | { success: false; error: string } {
  const parsed = calendarFormSchema.safeParse({
    commitmentType: formData.get("commitmentType"),
    title: formData.get("title"),
    localDate: formData.get("localDate"),
    eventStartTime: String(formData.get("eventStartTime") ?? ""),
    deadlineDueTime: String(formData.get("deadlineDueTime") ?? ""),
    noExactTime: formData.get("noExactTime") === "on",
    durationHours: String(formData.get("durationHours") ?? ""),
    durationMinutes: String(formData.get("durationMinutes") ?? ""),
    recurrence: formData.get("recurrence") ?? "none",
    recurrenceUnit: String(formData.get("recurrenceUnit") ?? ""),
    recurrenceInterval: String(formData.get("recurrenceInterval") ?? "1"),
    recurrenceWeekdays: formData.getAll("recurrenceWeekdays"),
    details: String(formData.get("details") ?? ""),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the commitment details." };
  }

  const value = parsed.data;
  if (!wholeNumber.test(value.recurrenceInterval)) {
    return { success: false, error: "Repeat interval must use a whole number." };
  }
  const recurrenceRule: CalendarRecurrenceRule = {
    unit: value.recurrenceUnit || null,
    interval: Number(value.recurrenceInterval),
    weekdays: value.recurrenceWeekdays,
  };
  const recurrenceError = validateCalendarRecurrenceRule(recurrenceRule);
  if (recurrenceError) return { success: false, error: recurrenceError };
  if (value.commitmentType === "event" && !validTime(value.eventStartTime)) {
    return { success: false, error: "Choose a start time." };
  }
  if (
    value.commitmentType === "deadline" &&
    !value.noExactTime &&
    !validTime(value.deadlineDueTime)
  ) {
    return { success: false, error: "Choose a due time or select No exact time." };
  }

  const duration = parseOptionalDuration(
    value.commitmentType,
    value.durationHours,
    value.durationMinutes,
  );
  if (typeof duration === "string") {
    return { success: false, error: duration };
  }

  const reminderValues = formData.getAll("reminderOffsets").map(Number);
  const reminderResult = validateReminderOffsets(
    reminderValues,
    getReminderCommitmentKind(
      value.commitmentType,
      value.commitmentType === "event" || !value.noExactTime,
    ),
  );
  if (!reminderResult.success) {
    return { success: false, error: reminderResult.error };
  }

  return {
    success: true,
    data: {
      commitmentType: value.commitmentType,
      title: value.title,
      localDate: value.localDate,
      eventStartTime:
        value.commitmentType === "event" ? value.eventStartTime : null,
      deadlineDueTime:
        value.commitmentType === "deadline" && !value.noExactTime
          ? value.deadlineDueTime
          : null,
      durationMinutes: duration,
      recurrence: getLegacyCalendarRecurrencePreset(
        recurrenceRule,
        value.localDate,
      ),
      recurrenceRule,
      details: value.details.trim() || null,
      reminderOffsetsMinutes: reminderResult.offsets,
    },
  };
}

function parseOptionalDuration(
  type: CalendarCommitmentType,
  hoursValue: string,
  minutesValue: string,
) {
  if (type === "deadline") return null;
  const hoursText = hoursValue || "0";
  const minutesText = minutesValue || "0";
  if (!wholeNumber.test(hoursText) || !wholeNumber.test(minutesText)) {
    return "Duration must use whole hours and minutes.";
  }
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (minutes > 59) return "Minutes must be between 0 and 59.";
  const total = hours * 60 + minutes;
  if (total === 0) return null;
  if (total > 1440) return "Duration must be within one day.";
  return total;
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
