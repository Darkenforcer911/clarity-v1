import assert from "node:assert/strict";
import test from "node:test";

import { collectReturnGapEvidence } from "./return-gap-evidence.ts";

function action(overrides = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Gym",
    status: "completed",
    approvedAt: null,
    completionEvidenceOnly: false,
    completedAt: "2026-08-15T11:45:00.000Z",
    completionTimeUnknown: false,
    rescheduledFor: null,
    sortOrder: 0,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return {
    localDate: "2026-08-15",
    approvedAt: null,
    status: "proposed",
    actions: [action()],
    ...overrides,
  };
}

test("Catch-Up exposes an Already done proposed action as read-only evidence", () => {
  assert.deepEqual(collectReturnGapEvidence([plan()]), [
    {
      actionId: "10000000-0000-4000-8000-000000000001",
      localDate: "2026-08-15",
      title: "Gym",
      outcome: "completed",
      source: "known_action",
      completedAt: "2026-08-15T11:45:00.000Z",
      completionTimeUnknown: false,
      rescheduledFor: null,
      sortOrder: 0,
    },
  ]);
});

test("known proposed completion and unplanned completion remain distinct", () => {
  const evidence = collectReturnGapEvidence([
    plan({
      actions: [
        action(),
        action({
          id: "10000000-0000-4000-8000-000000000002",
          title: "Helped a neighbour",
          completionEvidenceOnly: true,
          sortOrder: 1,
        }),
      ],
    }),
  ]);

  assert.deepEqual(
    evidence.map(({ title, source }) => ({ title, source })),
    [
      { title: "Gym", source: "known_action" },
      {
        title: "Helped a neighbour",
        source: "unplanned_completion",
      },
    ],
  );
});

test("Catch-Up includes legitimate pre-approval rescheduled and dropped evidence", () => {
  const evidence = collectReturnGapEvidence([
    plan({
      actions: [
        action({
          id: "10000000-0000-4000-8000-000000000003",
          title: "Call Mum",
          status: "rescheduled",
          completedAt: null,
          rescheduledFor: "2026-08-17",
        }),
        action({
          id: "10000000-0000-4000-8000-000000000004",
          title: "Buy milk",
          status: "dropped",
          completedAt: null,
          sortOrder: 2,
        }),
      ],
    }),
  ]);

  assert.deepEqual(
    evidence.map(({ title, outcome, rescheduledFor }) => ({
      title,
      outcome,
      rescheduledFor,
    })),
    [
      {
        title: "Call Mum",
        outcome: "rescheduled",
        rescheduledFor: "2026-08-17",
      },
      {
        title: "Buy milk",
        outcome: "dropped",
        rescheduledFor: null,
      },
    ],
  );
});

test("Catch-Up without pre-existing evidence stays empty", () => {
  assert.deepEqual(
    collectReturnGapEvidence([
      plan({
        actions: [
          action({ status: "proposed", completedAt: null }),
          action({
            id: "10000000-0000-4000-8000-000000000005",
            status: "removed",
            completedAt: null,
          }),
        ],
      }),
    ]),
    [],
  );
});

test("approved historical plans remain outside lightweight Catch-Up evidence", () => {
  assert.deepEqual(
    collectReturnGapEvidence([
      plan({
        approvedAt: "2026-08-15T09:00:00.000Z",
        status: "active",
      }),
    ]),
    [],
  );
});
