import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatCalendarActionOutcome,
  formatCalendarActionDue,
  formatCalendarActionTimeRange,
  getAcceptedCalendarDailyActions,
  partitionCalendarDailyActions,
} from "./calendar-daily-actions.ts";

const calendarServiceSource = readFileSync(
  new URL("./calendar-service.ts", import.meta.url),
  "utf8",
);
const calendarActionsSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-daily-actions.tsx",
    import.meta.url,
  ),
  "utf8",
);
const calendarHistorySource = readFileSync(
  new URL(
    "../../components/clarity/calendar-history.tsx",
    import.meta.url,
  ),
  "utf8",
);
const removalMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260727000003_remove_action_from_today.sql",
    import.meta.url,
  ),
  "utf8",
);
const lifeModelMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260818000001_life_model_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

function action(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Walk dog",
    action_type: "flexible",
    status: "active",
    estimated_minutes: 30,
    scheduled_time: null,
    completed_at: null,
    rescheduled_for: null,
    resolution_note: null,
    sort_order: 0,
    approved_at: "2026-09-01T07:00:00.000Z",
    source_routine_id: null,
    local_date: "2026-09-01",
    due_local_date: null,
    due_local_time: null,
    reminder_offsets_minutes: [],
    ...overrides,
  };
}

test("only accepted Daily Actions from an accepted plan become Calendar truth", () => {
  const accepted = action();
  const unaccepted = action({
    id: "22222222-2222-4222-8222-222222222222",
    approved_at: null,
    status: "proposed",
    sort_order: 1,
  });

  assert.deepEqual(
    getAcceptedCalendarDailyActions({
      status: "active",
      approved_at: "2026-09-01T07:00:00.000Z",
      daily_actions: [unaccepted, accepted],
    }),
    [accepted],
  );
  assert.deepEqual(
    getAcceptedCalendarDailyActions({
      status: "proposed",
      approved_at: null,
      daily_actions: [accepted],
    }),
    [],
  );
});

test("untimed Actions remain separate from scheduled Actions", () => {
  const untimed = action();
  const timed = action({
    id: "33333333-3333-4333-8333-333333333333",
    scheduled_time: "2026-09-01T09:00:00.000Z",
  });

  assert.deepEqual(partitionCalendarDailyActions([untimed, timed]), {
    due: [],
    timed: [timed],
    untimed: [untimed],
  });
  assert.equal(
    formatCalendarActionTimeRange(untimed, "Australia/Melbourne"),
    null,
  );
  assert.equal(
    formatCalendarActionTimeRange(timed, "Australia/Melbourne"),
    "7:00 pm–7:30 pm",
  );
});

test("an Action Due date is a projection of the same Action, not a copied Deadline", () => {
  const due = action({
    calendar_projection: "due",
    due_local_date: "2026-09-06",
    due_local_time: "23:59:00",
  });
  assert.deepEqual(partitionCalendarDailyActions([due]), {
    due: [due],
    timed: [],
    untimed: [],
  });
  assert.equal(formatCalendarActionDue(due), "Due · 11:59 pm");
});

test("accepted outcomes and same-day removal remain visible as history", () => {
  assert.equal(
    formatCalendarActionOutcome(
      action({
        status: "completed",
        completed_at: "2026-09-01T10:15:00.000Z",
      }),
      "Australia/Melbourne",
    ),
    "Completed · 8:15 pm",
  );
  assert.equal(
    formatCalendarActionOutcome(
      action({
        status: "dropped",
        resolution_note: "Removed from today",
      }),
      "Australia/Melbourne",
    ),
    "Removed from today",
  );
  assert.equal(
    formatCalendarActionOutcome(action({ status: "missed" }), "UTC"),
    "Didn't happen",
  );
});

test("Calendar reads owned Daily Actions directly without commitment copies", () => {
  assert.match(calendarServiceSource, /\.from\("daily_actions"\)/);
  assert.match(
    calendarServiceSource,
    /\.eq\("user_id", authenticatedUserId\)[\s\S]*\.or\(`local_date\.eq\.\$\{localDate\},due_local_date\.eq\.\$\{localDate\}`\)/,
  );
  assert.doesNotMatch(
    calendarServiceSource,
    /insert\s+into\s+(?:public\.)?calendar_commitments/i,
  );
  assert.match(calendarActionsSource, /title="Scheduled actions"/);
  assert.match(calendarActionsSource, /title="Actions"/);
  assert.match(calendarActionsSource, /title="Due"/);
  assert.match(calendarActionsSource, /from=calendar&date=/);
});

test("closed Calendar dates retain Quick Recap as their final historical truth", () => {
  assert.match(
    calendarServiceSource,
    /isPast && resolvedHistoricalRecord\?\.summary[\s\S]*calendar_projection === "due"/,
  );
  assert.match(
    calendarHistorySource,
    /applyHistoricalActionOutcomeRevisions\([\s\S]*originalSummary[\s\S]*record\.actionOutcomeRevisions/,
  );
  assert.match(calendarHistorySource, /summary\.completedActions\.map/);
  assert.match(calendarHistorySource, /outcome === "made_progress"/);
  assert.match(calendarHistorySource, /outcome === "not_done"/);
  assert.match(calendarHistorySource, /summary\.unplannedProgress\?\.map/);
  assert.match(calendarHistorySource, /Day reflection/);
  assert.match(
    calendarHistorySource,
    /record\.actionResolutionNotes\[item\.id\] === "Removed from today"/,
  );
});

test("Remove from today mutates only the owned occurrence row", () => {
  const removeFunction = removalMigration.slice(
    removalMigration.indexOf("create function public.remove_action_from_today"),
    removalMigration.indexOf("revoke all on function public.remove_action_from_today"),
  );

  assert.match(
    removeFunction,
    /from public\.daily_actions[\s\S]*id = p_daily_action_id[\s\S]*user_id = v_user_id[\s\S]*for update/i,
  );
  assert.match(
    removeFunction,
    /update public\.daily_actions[\s\S]*status = 'dropped'[\s\S]*resolution_note = 'Removed from today'[\s\S]*where id = v_action\.id/i,
  );
  assert.doesNotMatch(removeFunction, /update public\.routines|delete from public\.routines/i);
  assert.doesNotMatch(
    removeFunction,
    /where\s+source_routine_id\s*=|where\s+daily_plan_id\s*=/i,
  );
  assert.match(
    lifeModelMigration,
    /daily_actions_routine_owner_fkey[\s\S]*foreign key \(source_routine_id, user_id\)[\s\S]*references public\.routines\(id, user_id\)/i,
  );
});
