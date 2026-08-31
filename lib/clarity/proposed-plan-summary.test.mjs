import assert from "node:assert/strict";
import test from "node:test";

import {
  canApproveProposedPlan,
  formatDuration,
  formatProposedPlanSummary,
  shouldClearOpenDayConfirmation,
} from "./proposed-plan-summary.ts";

test("formats stored minutes for people", () => {
  assert.equal(formatDuration(1), "1m");
  assert.equal(formatDuration(30), "30m");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(61), "1h 1m");
  assert.equal(formatDuration(70), "1h 10m");
  assert.equal(formatDuration(80), "1h 20m");
  assert.equal(formatDuration(90), "1h 30m");
  assert.equal(formatDuration(120), "2h");
  assert.equal(formatDuration(135), "2h 15m");
});

test("formats compact action, duration and timed counts", () => {
  assert.equal(
    formatProposedPlanSummary(2, 133, 1),
    "2 actions · 2h 13m · 1 timed",
  );
  assert.equal(
    formatProposedPlanSummary(1, 60, 2),
    "1 action · 1h · 2 timed",
  );
  assert.equal(
    formatProposedPlanSummary(1, 25, 0),
    "1 action · 25m",
  );
});

test("requires explicit consent before approving an empty plan", () => {
  assert.equal(canApproveProposedPlan(0, false), false);
  assert.equal(canApproveProposedPlan(0, true), true);
  assert.equal(canApproveProposedPlan(1, false), true);
});

test("adding an action clears prior open-day consent", () => {
  assert.equal(shouldClearOpenDayConfirmation(0, 1), true);
  assert.equal(shouldClearOpenDayConfirmation(1, 1), false);
  assert.equal(shouldClearOpenDayConfirmation(1, 0), false);
});
