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
      ? { hasBlockingActions: false, ...previousPlan }
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

test("an unapproved plan with a blocking action is rejected as inconsistent", () => {
  assert.deepEqual(
    resolve({
      previousPlan: {
        localDate: "2026-08-02",
        status: "proposed",
        approvedAt: null,
        hasBlockingActions: true,
      },
    }),
    {
      kind: "inconsistent_unapproved_plan",
      localDate: "2026-08-02",
    },
  );
});

test("an approved day resolves through recap, then its following gap, then today", () => {
  const recap = resolve({
    previousPlan: {
      localDate: "2026-08-01",
      status: "active",
      approvedAt: "2026-08-01T09:00:00.000Z",
    },
  });
  assert.deepEqual(recap, {
    kind: "quick_recap",
    localDate: "2026-08-01",
  });

  const afterRecap = resolve({ latestClosedPlanDate: "2026-08-01" });
  assert.deepEqual(afterRecap, {
    kind: "gap",
    gapStartDate: "2026-08-02",
    gapEndDate: "2026-08-02",
  });

  const afterGapSave = resolve({
    latestClosedPlanDate: "2026-08-01",
    latestGapEndDate: "2026-08-02",
  });
  assert.deepEqual(afterGapSave, { kind: "resolved" });
  assert.deepEqual(
    resolve({
      latestClosedPlanDate: "2026-08-01",
      latestGapEndDate: "2026-08-02",
    }),
    afterGapSave,
  );
});

test("multiple consecutive missed dates remain one bounded gap", () => {
  assert.deepEqual(
    resolve({ latestClosedPlanDate: "2026-07-29" }),
    {
      kind: "gap",
      gapStartDate: "2026-07-30",
      gapEndDate: "2026-08-02",
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
