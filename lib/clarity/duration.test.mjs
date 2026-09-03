import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDuration,
  parseDurationInput,
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

test("friendly duration input resolves deterministically to stored minutes", () => {
  assert.equal(parseDurationInput("30m").totalMinutes, 30);
  assert.equal(parseDurationInput("45m").totalMinutes, 45);
  assert.equal(parseDurationInput("1h").totalMinutes, 60);
  assert.equal(parseDurationInput("1h 15m").totalMinutes, 75);
  assert.equal(parseDurationInput("2h 30m").totalMinutes, 150);
  assert.equal(parseDurationInput(" 1H30M ").totalMinutes, 90);
});

test("friendly duration input preserves unknown and rejects invalid ranges", () => {
  assert.deepEqual(parseDurationInput(""), {
    totalMinutes: null,
    error: null,
  });
  for (const value of ["0m", "1.5h", "1h 60m", "24h 1m", "tomorrow"]) {
    assert.equal(parseDurationInput(value).totalMinutes, null);
    assert.ok(parseDurationInput(value).error);
  }
});
