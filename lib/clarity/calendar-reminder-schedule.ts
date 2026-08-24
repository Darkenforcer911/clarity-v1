import { addLocalDays, localDateTimeToIso } from "./date-time.ts";

export const NOTIFICATION_LATENESS_MINUTES = 120;
export const AT_START_NOTIFICATION_LATENESS_MINUTES = 10;

export type ReminderScheduleInput = {
  commitmentType: "event" | "deadline";
  occurrenceDate: string;
  wallClockTime: string | null;
  timezone: string;
  reminderOffsetMinutes: number;
};

export function calculateNotificationSchedule(input: ReminderScheduleInput) {
  if (
    !Number.isSafeInteger(input.reminderOffsetMinutes) ||
    input.reminderOffsetMinutes < 0
  ) {
    throw new Error("Reminder offset must be a non-negative whole number.");
  }

  if (input.commitmentType === "deadline" && input.wallClockTime === null) {
    if (
      input.reminderOffsetMinutes === 0 ||
      input.reminderOffsetMinutes % 1440 !== 0
    ) {
      throw new Error("Date-only reminders must use positive whole days.");
    }
    const reminderDate = addLocalDays(
      input.occurrenceDate,
      -(input.reminderOffsetMinutes / 1440),
    );
    const scheduledFor = localDateTimeToIso(
      reminderDate,
      "09:00",
      input.timezone,
    );
    return {
      scheduledFor,
      usefulUntil: new Date(
        new Date(scheduledFor).getTime() +
          NOTIFICATION_LATENESS_MINUTES * 60_000,
      ).toISOString(),
    };
  }

  if (!input.wallClockTime) {
    throw new Error("Timed reminders require a wall-clock time.");
  }
  const actualAt = localDateTimeToIso(
    input.occurrenceDate,
    input.wallClockTime.slice(0, 5),
    input.timezone,
  );
  const scheduledFor = new Date(
    new Date(actualAt).getTime() - input.reminderOffsetMinutes * 60_000,
  ).toISOString();
  if (input.reminderOffsetMinutes === 0) {
    return {
      scheduledFor,
      usefulUntil: new Date(
        new Date(scheduledFor).getTime() +
          AT_START_NOTIFICATION_LATENESS_MINUTES * 60_000,
      ).toISOString(),
    };
  }
  const usefulUntil = new Date(
    Math.min(
      new Date(scheduledFor).getTime() +
        NOTIFICATION_LATENESS_MINUTES * 60_000,
      new Date(actualAt).getTime(),
    ),
  ).toISOString();
  return { scheduledFor, usefulUntil };
}

export function isReminderScheduleFuture(
  input: ReminderScheduleInput,
  now = new Date(),
) {
  return (
    new Date(calculateNotificationSchedule(input).scheduledFor).getTime() >
    now.getTime()
  );
}
