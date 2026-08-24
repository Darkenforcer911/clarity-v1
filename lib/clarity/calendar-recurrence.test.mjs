import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatCalendarRecurrenceSummary,
  getLegacyCalendarRecurrencePreset,
  getNextCalendarOccurrence,
  normalizeCalendarRecurrenceRule,
  occursOnCalendarDate,
  validateCalendarRecurrenceRule,
} from "./calendar-recurrence.ts";

const storageMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260820000001_calendar_recurrence_rule_storage.sql",
    import.meta.url,
  ),
  "utf8",
);
const executionMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260820000002_calendar_recurrence_rule_execution.sql",
    import.meta.url,
  ),
  "utf8",
);

test("legacy recurrence values normalize without changing their schedules", () => {
  assert.deepEqual(normalizeCalendarRecurrenceRule({
    recurrence: "daily",
    localDate: "2026-08-17",
  }), { unit: "day", interval: 1, weekdays: [] });
  assert.deepEqual(normalizeCalendarRecurrenceRule({
    recurrence: "weekly",
    localDate: "2026-08-17",
  }), { unit: "week", interval: 1, weekdays: [1] });
  assert.deepEqual(normalizeCalendarRecurrenceRule({
    recurrence: "fortnightly",
    localDate: "2026-08-17",
  }), { unit: "week", interval: 2, weekdays: [1] });
  assert.deepEqual(normalizeCalendarRecurrenceRule({
    recurrence: "monthly",
    localDate: "2026-08-17",
  }), { unit: "month", interval: 1, weekdays: [] });
});

test("custom daily, weekly, monthly, and yearly intervals occur deterministically", () => {
  assert.equal(occursOnCalendarDate(
    "2026-08-17",
    { unit: "day", interval: 3, weekdays: [] },
    "2026-08-20",
  ), true);
  assert.equal(occursOnCalendarDate(
    "2026-08-17",
    { unit: "day", interval: 3, weekdays: [] },
    "2026-08-19",
  ), false);
  assert.equal(occursOnCalendarDate(
    "2026-08-17",
    { unit: "week", interval: 2, weekdays: [1, 3, 5] },
    "2026-08-19",
  ), true);
  assert.equal(occursOnCalendarDate(
    "2026-08-17",
    { unit: "week", interval: 2, weekdays: [1, 3, 5] },
    "2026-08-26",
  ), false);
  assert.equal(occursOnCalendarDate(
    "2026-01-31",
    { unit: "month", interval: 2, weekdays: [] },
    "2026-03-31",
  ), true);
  assert.equal(occursOnCalendarDate(
    "2024-02-29",
    { unit: "year", interval: 2, weekdays: [] },
    "2026-02-28",
  ), false);
  assert.equal(occursOnCalendarDate(
    "2024-02-29",
    { unit: "year", interval: 4, weekdays: [] },
    "2028-02-29",
  ), true);
});

test("weekly Custom supports exact weekday selection and readable summaries", () => {
  const rule = { unit: "week", interval: 3, weekdays: [1, 3, 5] };
  assert.equal(validateCalendarRecurrenceRule(rule), null);
  assert.equal(
    formatCalendarRecurrenceSummary(rule, "2026-08-17"),
    "Every 3 weeks · Mon, Wed, Fri",
  );
  assert.equal(
    getNextCalendarOccurrence("2026-08-17", rule, "2026-08-18"),
    "2026-08-19",
  );
});

test("Custom interval drafts retain strict 1–999 validation", () => {
  const preservedWeeklyRule = {
    unit: "week",
    interval: 2,
    weekdays: [1, 3, 5],
  };
  assert.match(
    validateCalendarRecurrenceRule({
      ...preservedWeeklyRule,
      interval: Number.NaN,
    }),
    /whole number between 1 and 999/,
  );
  assert.match(
    validateCalendarRecurrenceRule({ ...preservedWeeklyRule, interval: 0 }),
    /whole number between 1 and 999/,
  );
  assert.match(
    validateCalendarRecurrenceRule({ ...preservedWeeklyRule, interval: 1000 }),
    /whole number between 1 and 999/,
  );
  assert.deepEqual(preservedWeeklyRule.weekdays, [1, 3, 5]);
  assert.equal(
    formatCalendarRecurrenceSummary(
      { ...preservedWeeklyRule, interval: 3 },
      "2026-08-17",
    ),
    "Every 3 weeks · Mon, Wed, Fri",
  );
});

test("canonical recurrence retains legacy enum compatibility", () => {
  assert.equal(getLegacyCalendarRecurrencePreset(
    { unit: "week", interval: 2, weekdays: [1] },
    "2026-08-17",
  ), "fortnightly");
  assert.equal(getLegacyCalendarRecurrencePreset(
    { unit: "week", interval: 2, weekdays: [1, 3] },
    "2026-08-17",
  ), "weekly");
  assert.equal(getLegacyCalendarRecurrencePreset(
    { unit: "year", interval: 1, weekdays: [] },
    "2026-08-17",
  ), "yearly");
});

test("the two forward migrations cover storage, RPCs, reads, and notifications", () => {
  assert.match(storageMigration, /add value if not exists 'yearly'/);
  assert.match(storageMigration, /add column recurrence_unit/);
  assert.match(storageMigration, /add column recurrence_interval/);
  assert.match(storageMigration, /add column recurrence_weekdays/);
  assert.match(executionMigration, /calendar_recurrence_rule_is_valid/);
  assert.match(executionMigration, /create function public\.create_calendar_commitment/);
  assert.match(executionMigration, /create function public\.update_calendar_commitment/);
  assert.match(executionMigration, /create or replace function public\.get_calendar_commitments_for_date/);
  assert.match(executionMigration, /create or replace function public\.materialize_notification_deliveries/);
  assert.match(executionMigration, /create or replace function public\.revalidate_notification_delivery/);
  assert.match(executionMigration, /create or replace function public\.record_calendar_event_outcome/);
  assert.match(executionMigration, /create or replace function public\.correct_calendar_event_occurrence_outcome/);
  assert.match(executionMigration, /commitment\.recurrence_unit/);
  assert.match(executionMigration, /commitment\.recurrence_interval/);
  assert.match(executionMigration, /commitment\.recurrence_weekdays/);
});
