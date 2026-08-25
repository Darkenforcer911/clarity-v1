import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyHistoricalActionOutcomeRevisions } from "./historical-action-outcomes.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260819000003_historical_outcome_corrections_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
const historySource = readFileSync(
  new URL("../../components/clarity/calendar-history.tsx", import.meta.url),
  "utf8",
);
const agendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const serviceSource = readFileSync(
  new URL("./calendar-service.ts", import.meta.url),
  "utf8",
);
const lifeModelMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260818000001_life_model_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

const actionId = "00000000-0000-4000-8000-000000000001";
const original = {
  version: 1,
  dailyPlanId: "00000000-0000-4000-8000-000000000002",
  localDate: "2026-08-17",
  recordType: "reconciled",
  focus: null,
  completedCount: 0,
  totalCount: 1,
  completedActions: [],
  unfinishedActions: [
    {
      id: actionId,
      title: "Send application",
      outcome: "not_done",
      rescheduledFor: null,
      notDoneNote: "Ran out of time",
      approximateMinutes: 30,
    },
  ],
  recordedAt: "2026-08-18T01:00:00.000Z",
};

function revision(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    daily_action_id: actionId,
    new_status: "completed",
    new_completed_at: "2026-08-17T09:10:00.000Z",
    new_completion_time_unknown: false,
    new_rescheduled_for: null,
    correction_note: null,
    recorded_at: "2026-08-18T03:00:00.000Z",
    ...overrides,
  };
}

test("latest Action revision overlays the immutable Day Record", () => {
  const effective = applyHistoricalActionOutcomeRevisions(original, [revision()]);
  assert.equal(effective.completedCount, 1);
  assert.deepEqual(effective.unfinishedActions, []);
  assert.equal(effective.completedActions[0].completedAt, "2026-08-17T09:10:00.000Z");
  assert.equal(original.completedCount, 0);
  assert.equal(original.unfinishedActions.length, 1);
  assert.match(serviceSource, /applyHistoricalActionOutcomeRevisions|actionOutcomeRevisions/);
});

test("a clear-correction revision restores the original snapshot outcome", () => {
  const effective = applyHistoricalActionOutcomeRevisions(original, [
    revision({
      new_status: null,
      new_completed_at: null,
      new_completion_time_unknown: false,
    }),
  ]);
  assert.deepEqual(effective.completedActions, []);
  assert.deepEqual(effective.unfinishedActions, original.unfinishedActions);
});

test("Action correction is append-only and leaves Day Records and Actions immutable", () => {
  const actionFunction = migration.slice(
    migration.indexOf("create function public.correct_historical_daily_action_outcome"),
    migration.indexOf("create function public.get_historical_daily_action_outcomes_for_date"),
  );
  assert.match(migration, /create table public\.daily_action_outcome_revisions/i);
  assert.match(actionFunction, /insert into public\.daily_action_outcome_revisions/i);
  assert.doesNotMatch(actionFunction, /update public\.daily_actions/i);
  assert.doesNotMatch(actionFunction, /update public\.day_records/i);
  assert.doesNotMatch(actionFunction, /delete from/i);
  assert.match(actionFunction, /where id = p_daily_action_id[\s\S]*user_id = v_user_id[\s\S]*for update/i);
});

test("late-recorded completion belongs to the historical plan date", () => {
  assert.match(
    migration,
    /\(v_plan\.local_date \+ p_completed_time\) at time zone v_timezone/i,
  );
  assert.match(migration, /recorded_at timestamptz not null default clock_timestamp\(\)/i);
  assert.doesNotMatch(historySource, /recorded_at[^\n]*Completed/i);
  assert.doesNotMatch(
    migration,
    /correct_historical_daily_action_outcome[\s\S]*v_new_completed_at\s*:=\s*(v_now|clock_timestamp\(\))/i,
  );
});

test("historical Calendar correction keeps unknown completion time null", () => {
  const calendarFunction = migration.slice(
    migration.indexOf("create function public.correct_calendar_event_occurrence_outcome"),
    migration.indexOf("revoke all on function public.correct_historical_daily_action_outcome"),
  );
  assert.match(
    calendarFunction,
    /if p_new_outcome = 'attended' then\s+if p_completed_time is not null then/i,
  );
  assert.doesNotMatch(
    calendarFunction,
    /v_completed_at\s*:=\s*(v_now|clock_timestamp\(\))/i,
  );
  assert.doesNotMatch(calendarFunction, /event_start_time\s*=/i);
});

test("unsafe historical move is not offered or fabricated", () => {
  assert.doesNotMatch(historySource, /Moved to another day/);
  assert.doesNotMatch(migration, /insert into public\.daily_actions/);
  assert.doesNotMatch(migration, /update public\.daily_actions/);
});

test("unplanned completion stays distinct and uses completed_item", () => {
  assert.match(historySource, /Add something completed/);
  assert.match(historySource, /formData\.set\("correctionType", "completed_item"\)/);
  assert.match(historySource, /<RecapCompletedItemForm/);
  assert.doesNotMatch(historySource, />\s*Add correction\s*</);
});

test("Calendar correction appends before updating exactly one occurrence", () => {
  const calendarFunction = migration.slice(
    migration.indexOf("create function public.correct_calendar_event_occurrence_outcome"),
    migration.indexOf("revoke all on function public.correct_historical_daily_action_outcome"),
  );
  const appendAt = calendarFunction.indexOf(
    "insert into public.calendar_commitment_occurrence_revisions",
  );
  const updateAt = calendarFunction.indexOf(
    "update public.calendar_commitment_occurrences",
  );
  assert.ok(appendAt >= 0 && updateAt > appendAt);
  assert.match(calendarFunction, /where id = v_occurrence\.id/i);
  assert.doesNotMatch(calendarFunction, /update public\.calendar_commitments/i);
  assert.doesNotMatch(calendarFunction, /recurrence\s*=/i);
  assert.match(
    agendaSource,
    /currentDay \? "Update status" : "Correct outcome"/,
  );
  assert.doesNotMatch(agendaSource, />\s*Undo completion\s*</);
});

test("cross-user writes are ownership checked and Life Model evidence stays stable", () => {
  assert.match(migration, /user_id = v_user_id[\s\S]*for update/i);
  assert.match(
    lifeModelMigration,
    /foreign key \(source_daily_action_id, user_id\)[\s\S]*references public\.daily_actions\(id, user_id\)/i,
  );
  assert.match(
    lifeModelMigration,
    /foreign key \(source_calendar_occurrence_id, user_id\)[\s\S]*references public\.calendar_commitment_occurrences\(id, user_id\)/i,
  );
  assert.doesNotMatch(migration, /update public\.life_evidence|delete from public\.life_evidence/i);
});
