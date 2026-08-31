import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDuration,
  resolveEstimatedDuration,
  splitEstimatedDuration,
} from "./duration.ts";

test("formats stored minutes as compact human-readable durations", () => {
  assert.equal(formatDuration(20), "20m");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(75), "1h 15m");
  assert.equal(formatDuration(90), "1h 30m");
  assert.equal(formatDuration(120), "2h");
  assert.equal(formatDuration(150), "2h 30m");
});

test("stored minutes split into hours and remaining minutes", () => {
  assert.deepEqual(splitEstimatedDuration(25), {
    hours: "0",
    minutes: "25",
  });
  assert.deepEqual(splitEstimatedDuration(60), {
    hours: "1",
    minutes: "0",
  });
  assert.deepEqual(splitEstimatedDuration(75), {
    hours: "1",
    minutes: "15",
  });
  assert.deepEqual(splitEstimatedDuration(90), {
    hours: "1",
    minutes: "30",
  });
});

test("hours and minutes resolve to total stored minutes", () => {
  assert.equal(resolveEstimatedDuration("1", "30").totalMinutes, 90);
  assert.equal(resolveEstimatedDuration("2", "0").totalMinutes, 120);
});

test("invalid or zero durations do not resolve", () => {
  assert.equal(resolveEstimatedDuration("0", "0").totalMinutes, null);
  assert.equal(resolveEstimatedDuration("1.5", "0").totalMinutes, null);
  assert.equal(resolveEstimatedDuration("1", "60").totalMinutes, null);
  assert.equal(resolveEstimatedDuration("-1", "30").totalMinutes, null);
});
