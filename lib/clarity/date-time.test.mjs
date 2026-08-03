import assert from "node:assert/strict";
import test from "node:test";

import {
  formatScheduledTime,
  getDayPeriod,
  getLocalTime,
  hasScheduledMinutePassed,
  localDateTimeToIso,
  resolveFutureLocalDateTime,
} from "./date-time.ts";

test("scheduled times pass only after their profile-local minute", () => {
  const timezone = "Australia/Melbourne";
  const localDate = "2026-08-03";
  const scheduled = localDateTimeToIso(localDate, "05:07", timezone);

  assert.equal(
    hasScheduledMinutePassed(
      scheduled,
      localDate,
      timezone,
      new Date(localDateTimeToIso(localDate, "05:07", timezone)),
    ),
    false,
  );
  assert.equal(
    hasScheduledMinutePassed(
      scheduled,
      localDate,
      timezone,
      new Date(localDateTimeToIso(localDate, "05:08", timezone)),
    ),
    true,
  );
});

test("a Melbourne wall-clock action time survives storage and display", () => {
  const storedValue = localDateTimeToIso(
    "2026-07-31",
    "12:00",
    "Australia/Melbourne",
  );

  assert.equal(storedValue, "2026-07-31T02:00:00.000Z");
  assert.equal(
    getLocalTime(
      "Australia/Melbourne",
      new Date(storedValue),
    ),
    "12:00",
  );
  assert.equal(
    formatScheduledTime(storedValue, "Australia/Melbourne"),
    "12:00 pm",
  );
});

test("daypart boundaries follow the Clarity greeting rules", () => {
  const cases = [
    ["2026-08-03T04:59:00.000Z", "late_night"],
    ["2026-08-03T05:00:00.000Z", "morning"],
    ["2026-08-03T11:59:00.000Z", "morning"],
    ["2026-08-03T12:00:00.000Z", "afternoon"],
    ["2026-08-03T16:59:00.000Z", "afternoon"],
    ["2026-08-03T17:00:00.000Z", "evening"],
    ["2026-08-03T20:59:00.000Z", "evening"],
    ["2026-08-03T21:00:00.000Z", "late_night"],
  ];

  for (const [timestamp, expected] of cases) {
    assert.equal(getDayPeriod("UTC", new Date(timestamp)), expected);
  }
});

test("an explicit next-sleep value must resolve after now", () => {
  const now = new Date("2026-08-02T17:00:00.000Z");

  assert.equal(
    resolveFutureLocalDateTime(
      "2026-08-03T04:00",
      "Australia/Melbourne",
      now,
    ),
    "2026-08-02T18:00:00.000Z",
  );
  assert.throws(() =>
    resolveFutureLocalDateTime(
      "2026-08-03T02:00",
      "Australia/Melbourne",
      now,
    ),
  );
});

test("Wake at keeps the same Melbourne AM or PM wall-clock value", () => {
  const cases = [
    ["2026-08-02T17:47:00.000Z", "03:47", "3:47 am"],
    ["2026-08-02T14:05:00.000Z", "00:05", "12:05 am"],
    ["2026-08-03T02:05:00.000Z", "12:05", "12:05 pm"],
    ["2026-08-03T05:47:00.000Z", "15:47", "3:47 pm"],
  ];

  for (const [timestamp, inputValue, displayValue] of cases) {
    const date = new Date(timestamp);

    assert.equal(
      getLocalTime("Australia/Melbourne", date),
      inputValue,
    );
    assert.equal(
      formatScheduledTime(timestamp, "Australia/Melbourne"),
      displayValue,
    );
  }
});
