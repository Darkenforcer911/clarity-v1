import assert from "node:assert/strict";
import test from "node:test";

import { localDateTimeToIso } from "./date-time.ts";
import {
  orderLaterTodayItems,
  partitionRemainingActions,
} from "./today-display-order.ts";

const timezone = "Australia/Melbourne";
const localDate = "2026-09-01";

function action(id, sortOrder, time = null) {
  return {
    id,
    sort_order: sortOrder,
    scheduled_time: time
      ? localDateTimeToIso(localDate, time, timezone)
      : null,
  };
}

function commitment(id, time) {
  return {
    id,
    commitment_type: "event",
    occurrence_date: localDate,
    event_start_time: time,
    deadline_due_time: null,
  };
}

test("timed Actions and commitments share one chronological later-today order", () => {
  const items = orderLaterTodayItems({
    actions: [
      action("nine-action", 0, "21:00"),
      action("six-action", 2, "18:00"),
    ],
    commitments: [commitment("seven-commitment", "19:00")],
    timezone,
  });

  assert.deepEqual(
    items.map((item) => item.value.id),
    ["six-action", "seven-commitment", "nine-action"],
  );
});

test("a 6 PM timed item always renders above a 9 PM timed item", () => {
  const items = orderLaterTodayItems({
    actions: [action("nine", 0, "21:00")],
    commitments: [commitment("six", "18:00")],
    timezone,
  });

  assert.deepEqual(items.map((item) => item.value.id), ["six", "nine"]);
});

test("timed Actions never duplicate into Remaining actions", () => {
  const result = partitionRemainingActions(
    [action("next", 0), action("timed", 1, "21:00"), action("untimed", 2)],
    "next",
  );

  assert.deepEqual(result.timed.map((item) => item.id), ["timed"]);
  assert.deepEqual(result.untimed.map((item) => item.id), ["untimed"]);
});

test("untimed Remaining actions preserve accepted sort order", () => {
  const result = partitionRemainingActions(
    [action("third", 3), action("first", 1), action("second", 2)],
    null,
  );

  assert.deepEqual(result.untimed.map((item) => item.id), [
    "first",
    "second",
    "third",
  ]);
});
