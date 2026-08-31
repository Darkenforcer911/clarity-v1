import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveActionTiming,
  selectNextActiveAction,
} from "./active-today-scheduling.ts";
import { localDateTimeToIso } from "./date-time.ts";
import { formatDuration } from "./duration.ts";

const timezone = "Australia/Melbourne";
const localDate = "2026-08-04";

function action(
  id,
  sortOrder,
  estimatedMinutes,
  scheduledTime = null,
) {
  return {
    id,
    sort_order: sortOrder,
    estimated_minutes: estimatedMinutes,
    scheduled_time: scheduledTime
      ? localDateTimeToIso(localDate, scheduledTime, timezone)
      : null,
  };
}

function at(localTime) {
  return new Date(localDateTimeToIso(localDate, localTime, timezone));
}

test("the earliest overdue timed action becomes Next Action", () => {
  const flexible = action("flexible", 0, 30);
  const laterOverdue = action("later", 1, 20, "06:20");
  const earliestOverdue = action("earliest", 2, 20, "06:16");
  const actions = [flexible, laterOverdue, earliestOverdue];

  assert.equal(
    selectNextActiveAction(
      actions,
      localDate,
      timezone,
      at("06:29"),
    )?.id,
    "earliest",
  );
  const timing = getActiveActionTiming(
    earliestOverdue,
    localDate,
    timezone,
    at("06:29"),
  );
  assert.equal(timing.kind, "overdue");
  assert.equal(timing.minutesFromNow, 13);
  assert.equal(formatDuration(13), "13m");
});

test("an upcoming timed action wins when flexible work cannot fit", () => {
  const flexible = action("flexible", 0, 45);
  const timed = action("timed", 1, 15, "06:39");

  assert.equal(
    selectNextActiveAction(
      [flexible, timed],
      localDate,
      timezone,
      at("06:29"),
    )?.id,
    "timed",
  );
});

test("flexible work may lead when it fits before the next timed action", () => {
  const flexible = action("flexible", 0, 45);
  const timed = action("timed", 1, 15, "07:59");

  assert.equal(
    selectNextActiveAction(
      [flexible, timed],
      localDate,
      timezone,
      at("06:29"),
    )?.id,
    "flexible",
  );
});

test("the exact scheduled minute is Now rather than overdue", () => {
  const timed = action("timed", 0, 15, "06:16");

  assert.equal(
    getActiveActionTiming(
      timed,
      localDate,
      timezone,
      at("06:16"),
    ).kind,
    "now",
  );
});

test("removing the overdue action recalculates the next choice", () => {
  const flexible = action("flexible", 0, 30);
  const overdue = action("overdue", 1, 15, "06:16");
  const actions = [flexible, overdue];
  const now = at("06:29");

  assert.equal(
    selectNextActiveAction(actions, localDate, timezone, now)?.id,
    "overdue",
  );
  assert.equal(
    selectNextActiveAction(
      actions.filter((item) => item.id !== "overdue"),
      localDate,
      timezone,
      now,
    )?.id,
    "flexible",
  );
});
