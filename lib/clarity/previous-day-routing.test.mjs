import assert from "node:assert/strict";
import test from "node:test";

import { resolvePreviousDayRouting } from "./previous-day-routing.ts";

const currentLocalDate = "2026-08-03";

function resolve({
  previousPlan = null,
  latestClosedPlanDate = null,
  latestGapEndDate = null,
} = {}) {
  return resolvePreviousDayRouting({
    currentLocalDate,
    previousPlan: previousPlan
      ? { hasApprovedActions: false, ...previousPlan }
      : null,
    latestClosedPlanDate,
    latestGapEndDate,
  });
}

test("an approved unresolved Sunday plan routes to Quick Recap", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "active",
        approvedAt: "2026-08-02T09:00:00.000Z",
      },
    }),
    { kind: "quick_recap", localDate: "2026-08-02" },
  );
});

test("a started but unshaped Sunday routes to the Sunday gap", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "unshaped",
        approvedAt: null,
      },
      latestClosedPlanDate: "2026-08-01",
    }),
    {
      kind: "gap",
      gapStartDate: "2026-08-02",
      gapEndDate: "2026-08-02",
    },
  );
});

test("an unapproved proposed Sunday routes to the Sunday gap", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "proposed",
        approvedAt: null,
      },
      latestClosedPlanDate: "2026-08-01",
    }),
    {
      kind: "gap",
      gapStartDate: "2026-08-02",
      gapEndDate: "2026-08-02",
    },
  );
});

test("an approved proposed Sunday remains an approved-plan recovery", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "proposed",
        approvedAt: "2026-08-02T09:00:00.000Z",
      },
    }),
    { kind: "quick_recap", localDate: "2026-08-02" },
  );
});

test("an approved closing Sunday remains an approved-plan recovery", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "closing",
        approvedAt: "2026-08-02T09:00:00.000Z",
      },
    }),
    { kind: "quick_recap", localDate: "2026-08-02" },
  );
});

test("an unapproved active plan is rejected as inconsistent", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "active",
        approvedAt: null,
      },
    }),
    {
      kind: "inconsistent_unapproved_plan",
      localDate: "2026-08-02",
    },
  );
});

test("an unapproved plan with approved actions is rejected as inconsistent", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "proposed",
        approvedAt: null,
        hasApprovedActions: true,
      },
    }),
    {
      kind: "inconsistent_unapproved_plan",
      localDate: "2026-08-02",
    },
  );
});

test("a Sunday with no plan routes to the Sunday gap", () => {
  assert.deepEqual(resolve(), {
    kind: "gap",
    gapStartDate: "2026-08-02",
    gapEndDate: "2026-08-02",
  });
});

test("a closed Sunday allows Monday to start", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "closed",
        approvedAt: "2026-08-02T09:00:00.000Z",
      },
      latestClosedPlanDate: "2026-08-02",
    }),
    { kind: "resolved" },
  );
});

test("an acknowledged Sunday gap allows Monday to start", () => {
  assert.deepEqual(
    resolve({ latestGapEndDate: "2026-08-02" }),
    { kind: "resolved" },
  );
});

test("a current Monday plan does not bypass the Sunday gap boundary", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "unshaped",
        approvedAt: null,
      },
      latestClosedPlanDate: "2026-08-01",
    }),
    {
      kind: "gap",
      gapStartDate: "2026-08-02",
      gapEndDate: "2026-08-02",
    },
  );
});
