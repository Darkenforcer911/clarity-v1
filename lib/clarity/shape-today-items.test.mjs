import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { partitionShapeTodayItems } from "./shape-today-items.ts";

const proposedPlanSource = readFileSync(
  new URL("../../components/clarity/proposed-plan.tsx", import.meta.url),
  "utf8",
);
const dailyCommitmentsSource = readFileSync(
  new URL("../../components/clarity/daily-commitments.tsx", import.meta.url),
  "utf8",
);
const soFarTodaySource = readFileSync(
  new URL("../../components/clarity/so-far-today.tsx", import.meta.url),
  "utf8",
);
const calendarCommitmentDetailSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-commitment-detail.tsx",
    import.meta.url,
  ),
  "utf8",
);

const now = new Date("2026-09-03T08:00:00.000Z"); // 6:00 pm Melbourne
const localDate = "2026-09-03";
const timezone = "Australia/Melbourne";

function action(id, scheduledTime) {
  return {
    id,
    scheduled_time: scheduledTime,
    sort_order: 0,
    status: "proposed",
  };
}

function commitment(id, time, outcome = null) {
  return {
    id,
    commitment_type: "event",
    occurrence_date: localDate,
    event_start_time: time,
    deadline_due_time: null,
    status: "scheduled",
    reconciliation_outcome: outcome,
  };
}

test("Shape Today groups unresolved items by temporal behavior, not source", () => {
  const result = partitionShapeTodayItems({
    actions: [
      action("past-action", "2026-09-03T04:30:00.000Z"),
      action("future-action", "2026-09-03T10:00:00.000Z"),
      action("flexible-action", null),
    ],
    commitments: [
      commitment("past-commitment", "14:30:00"),
      commitment("future-commitment", "21:00:00"),
      commitment("resolved-commitment", "13:00:00", "attended"),
    ],
    localDate,
    timezone,
    now,
  });

  assert.deepEqual(result.earlierActions.map(({ id }) => id), ["past-action"]);
  assert.deepEqual(result.earlierCommitments.map(({ id }) => id), [
    "past-commitment",
  ]);
  assert.deepEqual(result.resolvedCommitments.map(({ id }) => id), [
    "resolved-commitment",
  ]);
  assert.deepEqual(result.fixedActions.map(({ id }) => id), ["future-action"]);
  assert.deepEqual(result.fixedCommitments.map(({ id }) => id), [
    "future-commitment",
  ]);
  assert.deepEqual(result.flexibleActions.map(({ id }) => id), [
    "flexible-action",
  ]);
});

test("Earlier and Fixed today share chronological Action and Calendar rendering", () => {
  assert.match(proposedPlanSource, /heading="Earlier today"/);
  assert.match(
    proposedPlanSource,
    /commitments=\{\[\.\.\.earlierCommitments, \.\.\.resolvedCommitments\]\}/,
  );
  assert.match(proposedPlanSource, /actions=\{earlierActions\}/);
  assert.match(proposedPlanSource, /heading="Fixed today"/);
  assert.match(proposedPlanSource, /commitments=\{fixedCommitments\}/);
  assert.match(proposedPlanSource, /actions=\{fixedActions\}/);
  assert.match(dailyCommitmentsSource, /orderLaterTodayItems\(\{/);
  assert.match(proposedPlanSource, /renderAction=\{renderTimedAction\}/);
  assert.match(dailyCommitmentsSource, /<CalendarOccurrenceWorkspace/);
});

test("timed Actions retain their proposed Action workspace and flexible reorder is isolated", () => {
  assert.match(
    proposedPlanSource,
    /function renderTimedAction[\s\S]*<ProposedActionCard/,
  );
  assert.match(
    proposedPlanSource,
    /flexibleActions: flexibleRemainingActions/,
  );
  assert.match(
    proposedPlanSource,
    /flexibleRemainingActions\.map\(\(action, actionIndex\)/,
  );
  assert.doesNotMatch(
    proposedPlanSource,
    /timedRemainingActions\.map\(\(action, actionIndex\)/,
  );
});

test("the heavy So far today Calendar outcome presentation is removed", () => {
  assert.doesNotMatch(soFarTodaySource, /So far today|CalendarOutcomeRow/);
  assert.doesNotMatch(soFarTodaySource, /recordCalendarEventOutcomeAction/);
  assert.match(proposedPlanSource, /completedActions=\{completedActions\}/);
  assert.match(proposedPlanSource, /Resolve earlier Actions before beginning/);
  assert.match(
    calendarCommitmentDetailSource,
    /<CalendarOccurrenceWorkspace/,
  );
});
