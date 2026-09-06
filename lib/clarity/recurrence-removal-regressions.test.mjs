import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const repairMigration = read(
  "../../supabase/migrations/20260907000001_reconcile_legacy_routine_occurrences.sql",
);
const convergenceMigration = read(
  "../../supabase/migrations/20260904000002_action_occurrence_convergence_v1.sql",
);
const actionPage = read("../../app/(app)/today/actions/[actionId]/page.tsx");
const actions = read("../../app/(app)/today/action-workspace-actions.ts");
const actionWorkspace = read("../../components/clarity/action-workspace.tsx");
const removePanel = read("../../components/clarity/remove-action-panel.tsx");
const calendarActions = read("../../components/clarity/calendar-daily-actions.tsx");
const actionDetail = read("../../components/clarity/action-detail.tsx");

test("legacy deterministic Routine rows participate in recurrence cleanup", () => {
  assert.match(repairMigration, /future_action\.source_routine_id = v_routine\.id/i);
  assert.match(repairMigration, /future_action\.local_date > v_action\.local_date/i);
  assert.match(repairMigration, /This routine applies today\./);
  assert.match(repairMigration, /Complete the routine as planned\./);
  assert.doesNotMatch(
    repairMigration.slice(
      repairMigration.indexOf("delete from public.daily_actions as future_action"),
      repairMigration.indexOf("perform private.reconcile_action_recurrence_v1_20260906"),
    ),
    /daily_plan_id is null/i,
  );
});

test("the forward repair removes safely identifiable rows already left by ended Routines", () => {
  const repair = repairMigration.slice(
    repairMigration.lastIndexOf("delete from public.daily_actions as future_action"),
  );
  assert.match(repair, /routine\.status = 'ended'/i);
  assert.match(
    repair,
    /future_action\.local_date >[\s\S]*routine\.ended_at at time zone profile\.timezone/i,
  );
  assert.match(repair, /This routine applies today\./);
  assert.match(repair, /This repeating action applies on this date\./);
});

test("recurrence cleanup preserves meaningful future truth and never title-matches alone", () => {
  assert.match(repairMigration, /future_action\.status = 'proposed'/i);
  assert.match(repairMigration, /future_action\.approved_at is null/i);
  assert.match(repairMigration, /future_action\.completed_at is null/i);
  assert.match(repairMigration, /future_action\.rescheduled_for is null/i);
  assert.match(repairMigration, /future_action\.resolution_note is null/i);
  assert.match(repairMigration, /future_action\.relationship_source is not distinct from v_routine\.created_via/i);
  assert.doesNotMatch(repairMigration, /lower\(|ilike|similarity/i);
});

test("an ended Routine cannot rematerialize a later occurrence", () => {
  const materializer = convergenceMigration.slice(
    convergenceMigration.indexOf(
      "create or replace function public.materialize_routine_action_occurrences",
    ),
    convergenceMigration.indexOf(
      "create or replace function public.create_action_occurrence_v1",
    ),
  );
  assert.match(materializer, /routine\.status = 'active'/i);
  assert.doesNotMatch(materializer, /routine\.status in \('active', 'ended'\)/i);
});

test("Calendar carries an owner-safe origin and date into the Action workspace", () => {
  assert.match(
    calendarActions,
    /\/today\/actions\/\$\{action\.id\}\?from=calendar&date=\$\{localDate\}/,
  );
  assert.match(actionPage, /firstQueryValue\(query\.from\) === "calendar"/);
  assert.match(actionPage, /calendarDate\?\.match\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(actionPage, /`\/calendar\?date=\$\{calendarDate\}`/);
});

test("workspace removal redirects before the removed Action route can reload", () => {
  assert.match(removePanel, /name="returnTo" value=\{returnTo\}/);
  assert.match(actions, /function parseActionRemovalReturn/);
  assert.match(actions, /z\.iso\.date\(\)\.safeParse/);
  assert.match(
    actions,
    /removeActionOccurrenceAction[\s\S]*removeOccurrence\(actionId\)[\s\S]*redirect\(actionRemovalDestination\(returnTo, actionId\)\)/,
  );
  assert.doesNotMatch(
    actionWorkspace,
    /onRemoved=\{\(\) => \{[\s\S]*router\.push\(returnHref\)[\s\S]*router\.refresh\(\)/,
  );
});

test("Today and Calendar origins resolve to their own safe destinations", () => {
  assert.match(actions, /requested === "\/today" \|\| requested === "\/today\/active"/);
  assert.match(actions, /\^\\\/calendar\\\?date=/);
  assert.match(actions, /returnTo === "\/today\/active"/);
  assert.match(actions, /`\/today\/active\?notice=removed&actionId=\$\{actionId\}`/);
});

test("skipping one Action occurrence retains the Routine definition", () => {
  const removeOccurrence = convergenceMigration.slice(
    convergenceMigration.indexOf(
      "create or replace function public.remove_action_occurrence_v1",
    ),
    convergenceMigration.indexOf(
      "create or replace function public.update_action_occurrence_v1",
    ),
  );
  assert.match(removeOccurrence, /update public\.daily_actions/i);
  assert.doesNotMatch(removeOccurrence, /update public\.routines/i);
  assert.doesNotMatch(removeOccurrence, /delete from public\.routines/i);
});

test("ended recurrence metadata is not presented as active Daily truth", () => {
  assert.match(actionDetail, /routine\?\.status !== "active"/);
  assert.match(actionWorkspace, /const recurring = routine\?\.status === "active"/);
});
