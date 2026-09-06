import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatCommitmentTime,
  getCalendarStripDates,
  getCalendarDateMode,
  occursOnCalendarDate,
  resolveCalendarCommitmentSelection,
  resolveCalendarSelectedDate,
} from "./calendar-rules.ts";

test("recurrence presets expand from the anchored local date", () => {
  assert.equal(occursOnCalendarDate("2026-08-05", "daily", "2026-08-06"), true);
  assert.equal(occursOnCalendarDate("2026-08-05", "weekly", "2026-08-12"), true);
  assert.equal(occursOnCalendarDate("2026-08-05", "weekly", "2026-08-13"), false);
  assert.equal(occursOnCalendarDate("2026-08-05", "fortnightly", "2026-08-19"), true);
  assert.equal(occursOnCalendarDate("2026-08-05", "monthly", "2026-09-05"), true);
});

test("wall-clock times retain their selected display value", () => {
  assert.equal(formatCommitmentTime("00:05:00"), "12:05 am");
  assert.equal(formatCommitmentTime("12:05:00"), "12:05 pm");
  assert.equal(formatCommitmentTime("15:47:00"), "3:47 pm");
});

test("calendar dates resolve to Past, Today, or Future", () => {
  assert.equal(getCalendarDateMode("2026-08-04", "2026-08-05"), "past");
  assert.equal(getCalendarDateMode("2026-08-05", "2026-08-05"), "today");
  assert.equal(getCalendarDateMode("2026-08-06", "2026-08-05"), "future");
});

test("a fresh Calendar visit selects profile-local Today", () => {
  assert.equal(resolveCalendarSelectedDate(undefined, "2026-08-05"), "2026-08-05");
  assert.equal(resolveCalendarSelectedDate("2026-07-30", "2026-08-05"), "2026-07-30");
  assert.equal(resolveCalendarSelectedDate("2026-02-30", "2026-08-05"), "2026-08-05");
});

test("the week strip keeps the canonical selected date on Thursday 20", () => {
  const selectedDate = resolveCalendarSelectedDate(
    "2026-08-20",
    "2026-08-19",
  );
  const stripDates = getCalendarStripDates(selectedDate);

  assert.deepEqual(stripDates, [
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
    "2026-08-22",
    "2026-08-23",
  ]);
  assert.equal(stripDates.filter((date) => date === selectedDate).length, 1);
  assert.equal(stripDates[3], "2026-08-20");
  assert.notEqual(stripDates[4], selectedDate);
});

test("date-only selection remains stable across timezone-sensitive boundaries", () => {
  assert.equal(
    resolveCalendarSelectedDate("2026-01-01", "2025-12-31"),
    "2026-01-01",
  );
  assert.equal(
    resolveCalendarSelectedDate("2028-02-29", "2028-03-01"),
    "2028-02-29",
  );
  assert.equal(
    resolveCalendarSelectedDate("2026-02-29", "2026-03-01"),
    "2026-03-01",
  );
});

test("a Calendar notification selects only its commitment on the requested date", () => {
  const intendedId = "10000000-0000-4000-8000-000000000001";
  const commitments = [{ id: intendedId }, { id: "another-id" }];

  assert.equal(
    resolveCalendarCommitmentSelection(intendedId, commitments),
    intendedId,
  );
  assert.equal(
    resolveCalendarCommitmentSelection("missing-id", commitments),
    null,
  );
});

test("the Calendar route preserves both notification query parameters", () => {
  const pageSource = readFileSync(
    new URL("../../app/(app)/calendar/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(pageSource, /typeof query\.date === "string" \? query\.date/);
  assert.match(
    pageSource,
    /typeof query\.commitment === "string"[\s\S]*redirect\([\s\S]*encodeURIComponent\(query\.commitment\)[\s\S]*encodeURIComponent\(query\.date\)/,
  );
});
