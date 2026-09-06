import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
  "../../supabase/migrations/20260906000002_reconcile_recurring_occurrences.sql",
);
const actionService = read("./action-workspace-service.ts");
const actionWorkspace = read("../../components/clarity/action-workspace.tsx");
const actionDetail = read("../../components/clarity/action-detail.tsx");
const actionSeries = read(
  "../../components/clarity/action-repeat-series-controls.tsx",
);
const calendarAgenda = read("../../components/clarity/calendar-agenda.tsx");
const calendarWorkspace = read(
  "../../components/clarity/calendar-occurrence-workspace.tsx",
);
const calendarDetail = read(
  "../../components/clarity/calendar-commitment-detail.tsx",
);
const calendarRoute = read(
  "../../app/(app)/calendar/commitments/[commitmentId]/page.tsx",
);
const calendarService = read("./calendar-service.ts");

test("canonical recurrence is detected only through an active owned Routine link", () => {
  assert.match(actionWorkspace, /routine\?\.status === "active"/);
  assert.match(actionDetail, /routine\?\.status !== "active"/);
  assert.match(actionSeries, /Doesn't repeat|RecurrenceControl/);
  assert.doesNotMatch(actionWorkspace, /recurrence_pattern.*recurring/s);
});

test("Action recurrence changes use one occurrence-aware authoritative RPC", () => {
  assert.match(
    actionService,
    /changeRepeat\([\s\S]*getAction\(actionId\)[\s\S]*change_action_recurrence_v1/,
  );
  assert.match(
    actionService,
    /stopRepeating\([\s\S]*change_action_recurrence_v1[\s\S]*p_recurrence_pattern: "none"/,
  );
  assert.match(
    migration,
    /create or replace function public\.change_action_recurrence_v1/i,
  );
  assert.match(
    migration,
    /create or replace function public\.update_action_occurrence_v1[\s\S]*private\.reconcile_action_recurrence_v1/i,
  );
});

test("recurrence reconciliation preserves the selected and historical occurrences", () => {
  const reconcile = migration.slice(
    migration.indexOf("create or replace function private.reconcile_action_recurrence_v1"),
    migration.indexOf("revoke all on function private.reconcile_action_recurrence_v1"),
  );
  assert.match(reconcile, /future_action\.local_date > v_action\.local_date/i);
  assert.doesNotMatch(reconcile, /future_action\.local_date >= v_action\.local_date/i);
  assert.match(reconcile, /future_action\.status = 'proposed'/i);
  assert.match(reconcile, /future_action\.approved_at is null/i);
  assert.match(reconcile, /future_action\.completed_at is null/i);
  assert.match(reconcile, /future_action\.source_routine_id = v_routine\.id/i);
});

test("only pristine deterministic future rows are safe to regenerate", () => {
  const deletion = migration.slice(
    migration.indexOf("delete from public.daily_actions as future_action"),
    migration.indexOf("if p_recurrence_pattern = 'none'"),
  );
  assert.match(deletion, /future_action\.why_it_exists = 'This repeating action applies on this date\.'/i);
  assert.match(deletion, /future_action\.title = v_routine\.title/i);
  assert.match(deletion, /future_action\.scheduled_time is not distinct from/i);
  assert.match(deletion, /future_action\.details is not distinct from v_routine\.details/i);
  assert.match(deletion, /future_action\.goal_id is not distinct from v_routine\.goal_id/i);
  assert.doesNotMatch(deletion, /lower\(|ilike|similarity/i);
});

test("Doesn't repeat ends only the definition and leaves the selected occurrence canonical", () => {
  assert.match(
    migration,
    /p_recurrence_pattern = 'none'[\s\S]*update public\.routines[\s\S]*status = 'ended'[\s\S]*update public\.daily_actions[\s\S]*source_routine_id = null/i,
  );
  assert.match(
    migration,
    /recurrence_pattern = 'none'[\s\S]*recurrence_days = '\{\}'/i,
  );
  assert.match(actionSeries, /resolveActionRecurrencePrimaryChoice/);
});

test("Daily to Weekly or Custom uses the selected occurrence as the new anchor", () => {
  assert.match(
    migration,
    /when 'weekly' then 'weekly'::public\.routine_cadence[\s\S]*else 'certain_days'::public\.routine_cadence/i,
  );
  assert.match(
    migration,
    /update public\.routines[\s\S]*cadence = v_cadence[\s\S]*weekdays = v_weekdays[\s\S]*start_on = v_action\.local_date/i,
  );
});

test("future Calendar skipping is the only future outcome correction allowed", () => {
  assert.match(
    migration,
    /p_occurrence_date > v_today[\s\S]*p_new_outcome is distinct from 'cancelled'::public\.calendar_event_outcome[\s\S]*future Calendar occurrence can only be skipped/i,
  );
  assert.match(
    migration,
    /calendar_commitment_occurs_on_date[\s\S]*occurrence_date = p_occurrence_date/i,
  );
  assert.doesNotMatch(
    migration.slice(migration.indexOf("create or replace function public.correct_calendar_event_occurrence_outcome")),
    /update public\.calendar_commitments/i,
  );
});

test("Calendar rows and workspaces target the selected occurrence date", () => {
  assert.match(
    calendarAgenda,
    /commitment\.occurrence_date >= today/,
  );
  assert.match(calendarAgenda, /Skip this occurrence/);
  assert.match(
    calendarWorkspace,
    /commitment\.occurrence_date >= today/,
  );
  assert.match(calendarWorkspace, /name="occurrenceDate"/);
  assert.match(calendarWorkspace, /value=\{commitment\.occurrence_date\}/);
});

test("Calendar commitments open a full owner-loaded occurrence workspace", () => {
  assert.match(
    calendarAgenda,
    /href=\{`\/calendar\/commitments\/\$\{commitment\.id\}\?date=\$\{commitment\.occurrence_date\}`\}/,
  );
  assert.doesNotMatch(calendarAgenda, /<CalendarOccurrenceWorkspace/);
  assert.match(calendarRoute, /getCalendarCommitmentContext/);
  assert.match(calendarRoute, /<CalendarCommitmentDetail/);
  assert.match(calendarDetail, /<CalendarOccurrenceWorkspace/);
  assert.match(calendarDetail, /Back to Calendar/);
  assert.match(calendarDetail, /<CalendarCommitmentForm/);
});

test("Calendar occurrence loading validates URL shape and ownership", () => {
  assert.match(calendarService, /commitmentId: z\.string\(\)\.uuid\(\)/);
  assert.match(calendarService, /localDate: z\.iso\.date\(\)/);
  assert.match(
    calendarService,
    /getAuthenticatedUserAndProfile\(\)[\s\S]*getCalendarCommitmentsForDate/,
  );
  assert.match(
    calendarService,
    /candidate\.id === parsed\.data\.commitmentId[\s\S]*candidate\.occurrence_date === parsed\.data\.localDate/,
  );
});
