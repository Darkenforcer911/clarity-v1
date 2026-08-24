import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_REMINDER_OFFSET_MINUTES,
  canonicalizeReminderOffsets,
  customReminderToMinutes,
  formatCustomReminderOffset,
  formatReminderOffset,
  getAllowedReminderPresets,
  getAvailableReminderPresets,
  getDefaultAvailableReminderOffsets,
  getDefaultReminderOffsets,
  normalizeSingleReminderOffsets,
  preserveReminderOffsets,
  selectSingleReminderOffset,
  validateReminderSchedule,
  validateReminderOffsets,
} from "./calendar-reminders.ts";

test("Calendar reminder presets and defaults match V1 product rules", () => {
  assert.deepEqual(getDefaultReminderOffsets("event"), [0]);
  assert.deepEqual(getDefaultReminderOffsets("timed_deadline"), [1440]);
  assert.deepEqual(getDefaultReminderOffsets("date_only_deadline"), [1440]);
  assert.deepEqual(getAllowedReminderPresets("event"), [0, 30, 120, 1440]);
  assert.deepEqual(
    getAllowedReminderPresets("timed_deadline"),
    [0, 30, 120, 1440],
  );
  assert.deepEqual(getAllowedReminderPresets("date_only_deadline"), [1440]);
});

test("the V1 form accepts zero or one reminder offset", () => {
  assert.deepEqual(validateReminderOffsets([], "event"), {
    success: true,
    offsets: [],
  });
  assert.deepEqual(validateReminderOffsets([120], "event"), {
    success: true,
    offsets: [120],
  });
  assert.deepEqual(validateReminderOffsets([0], "event"), {
    success: true,
    offsets: [0],
  });
  assert.deepEqual(validateReminderOffsets([0], "timed_deadline"), {
    success: true,
    offsets: [0],
  });
  assert.deepEqual(validateReminderOffsets([120, 30], "event"), {
    success: false,
    error: "Choose one reminder.",
  });
});

test("duplicates, negative and excessive offsets are rejected", () => {
  assert.equal(validateReminderOffsets([120, 120], "event").success, false);
  assert.equal(validateReminderOffsets([-30], "event").success, false);
  assert.equal(
    validateReminderOffsets([MAX_REMINDER_OFFSET_MINUTES + 1], "event").success,
    false,
  );
});

test("date-only deadlines keep only whole-day reminders", () => {
  assert.equal(
    validateReminderOffsets([0], "date_only_deadline").success,
    false,
  );
  assert.equal(
    validateReminderOffsets([120], "date_only_deadline").success,
    false,
  );
  assert.deepEqual(
    preserveReminderOffsets([2880, 1440, 120, 30], "date_only_deadline"),
    [2880, 1440],
  );
});

test("editing and recurrence preserve compatible reminder settings", () => {
  assert.deepEqual(preserveReminderOffsets([1440, 30], "event"), [1440, 30]);
  assert.deepEqual(
    preserveReminderOffsets([1440, 120], "timed_deadline"),
    [1440, 120],
  );
});

test("canonicalization safely removes duplicates", () => {
  assert.deepEqual(
    canonicalizeReminderOffsets([120, 0, 30, 120], "event"),
    [120, 30, 0],
  );
  assert.deepEqual(
    canonicalizeReminderOffsets([1440, 0], "date_only_deadline"),
    [1440],
  );
});

test("legacy multiple reminders normalize to the closest compatible offset", () => {
  assert.deepEqual(
    normalizeSingleReminderOffsets([1440, 120, 30], "event"),
    [30],
  );
  assert.deepEqual(
    normalizeSingleReminderOffsets(
      [2880, 1440, 120],
      "date_only_deadline",
    ),
    [1440],
  );
});

test("selecting another reminder replaces the prior selection", () => {
  let offsets = selectSingleReminderOffset(1440);
  offsets = selectSingleReminderOffset(120);
  assert.deepEqual(offsets, [120]);
});

test("custom reminder units normalize to positive minutes", () => {
  assert.equal(customReminderToMinutes(45, "minutes"), 45);
  assert.equal(customReminderToMinutes(2, "hours"), 120);
  assert.equal(customReminderToMinutes(3, "days"), 4320);
  assert.equal(customReminderToMinutes(0, "hours"), null);
  assert.equal(customReminderToMinutes(31, "days"), null);
  assert.equal(customReminderToMinutes(59, "minutes"), 59);
  assert.equal(customReminderToMinutes(60, "minutes"), null);
  assert.equal(customReminderToMinutes(23, "hours"), 1380);
  assert.equal(customReminderToMinutes(24, "hours"), null);
  assert.equal(customReminderToMinutes(30, "days"), 43200);
});

test("past preset times are unavailable in the profile timezone", () => {
  const context = {
    occurrenceDate: "2026-08-17",
    wallClockTime: "10:00",
    timezone: "Australia/Melbourne",
    now: new Date("2026-08-16T23:00:00.000Z"),
    recurrence: "none",
  };
  assert.deepEqual(getAvailableReminderPresets("event", context), [0, 30]);
  assert.deepEqual(getDefaultAvailableReminderOffsets("event", context), [0]);
  assert.deepEqual(
    getDefaultAvailableReminderOffsets("timed_deadline", context),
    [30],
  );
});

test("timed deadlines choose the first still-valid fallback preset", () => {
  const context = {
    occurrenceDate: "2026-08-17",
    wallClockTime: "12:00",
    timezone: "Australia/Melbourne",
    now: new Date("2026-08-16T23:00:00.000Z"),
    recurrence: "none",
  };
  assert.deepEqual(
    getDefaultAvailableReminderOffsets("timed_deadline", context),
    [120],
  );
});

test("At start remains the fallback after before-time presets have passed", () => {
  const context = {
    occurrenceDate: "2026-08-17",
    wallClockTime: "09:20",
    timezone: "Australia/Melbourne",
    now: new Date("2026-08-16T23:00:00.000Z"),
    recurrence: "none",
  };
  assert.deepEqual(getDefaultAvailableReminderOffsets("event", context), [0]);
  assert.deepEqual(
    getDefaultAvailableReminderOffsets("timed_deadline", context),
    [0],
  );
});

test("defaults become None after the timed occurrence itself has passed", () => {
  const context = {
    occurrenceDate: "2026-08-17",
    wallClockTime: "08:59",
    timezone: "Australia/Melbourne",
    now: new Date("2026-08-16T23:00:00.000Z"),
    recurrence: "none",
  };
  assert.deepEqual(getDefaultAvailableReminderOffsets("event", context), []);
  assert.deepEqual(
    getDefaultAvailableReminderOffsets("timed_deadline", context),
    [],
  );
});

test("domain validation rejects reminder instants that are no longer future", () => {
  const context = {
    occurrenceDate: "2026-08-17",
    wallClockTime: "10:00",
    timezone: "Australia/Melbourne",
    now: new Date("2026-08-16T23:00:00.000Z"),
    recurrence: "none",
  };
  assert.equal(validateReminderSchedule([30], "event", context).success, true);
  assert.deepEqual(validateReminderSchedule([120], "event", context), {
    success: false,
    error:
      "That reminder time has already passed. Choose a reminder closer to the event.",
  });
});

test("reminder validation follows the next canonical custom recurrence", () => {
  const context = {
    occurrenceDate: "2026-08-01",
    wallClockTime: "10:00",
    timezone: "Australia/Melbourne",
    now: new Date("2026-08-18T00:00:00.000Z"),
    recurrence: "weekly",
    recurrenceRule: { unit: "week", interval: 3, weekdays: [1, 3] },
  };
  assert.equal(validateReminderSchedule([120], "event", context).success, true);
  assert.equal(validateReminderSchedule([43_200], "event", context).success, true);
});

test("custom reminder summaries use combined hours and minutes", () => {
  assert.equal(formatCustomReminderOffset(608), "10 hr 8 min before");
  assert.equal(formatCustomReminderOffset(61), "1 hr 1 min before");
});

test("zero offset is presented as At start time", () => {
  assert.equal(formatReminderOffset(0), "At start time");
});
