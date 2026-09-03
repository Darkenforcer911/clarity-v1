import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const migration = read(
  "../../supabase/migrations/20260904000002_action_occurrence_convergence_v1.sql",
);
const actionService = read("./action-workspace-service.ts");
const workspaceQuery = read("./daily-loop-queries.ts");
const calendarService = read("./calendar-service.ts");
const calendarActions = read("../../components/clarity/calendar-daily-actions.tsx");
const actionFields = read("../../components/clarity/action-fields.tsx");
const addAction = read("../../components/clarity/add-action-form.tsx");
const proposedAction = read("../../components/clarity/proposed-action-card.tsx");
const actionWorkspace = read("../../components/clarity/action-workspace.tsx");
const actionDetail = read("../../components/clarity/action-detail.tsx");
const completedEvidence = read("../../components/clarity/so-far-today.tsx");

test("the convergence migration avoids invalid PostgreSQL BETWEEN syntax", () => {
  // This is a targeted regression guard, not a substitute for parsing the
  // migration with PostgreSQL during the linked migration dry run.
  assert.doesNotMatch(migration, /\bis\s+not\s+between\b/i);
  assert.match(
    migration,
    /p_duration_minutes not between 0 and 1440/i,
  );
  assert.match(
    migration,
    /p_duration_minutes not between 1 and 1440/i,
  );
});

test("daily_actions local_date is canonical while Daily Plan membership is optional", () => {
  assert.match(migration, /add column local_date date/i);
  assert.match(
    migration,
    /update public\.daily_actions[\s\S]*set local_date = plan\.local_date/i,
  );
  assert.match(migration, /alter column local_date set not null/i);
  assert.match(migration, /alter column daily_plan_id drop not null/i);
  assert.match(migration, /create trigger daily_actions_ensure_local_date/i);
  assert.match(
    migration,
    /Action date must match its Daily Plan date/i,
  );
});

test("future Actions are created once and later attached to the matching plan", () => {
  assert.match(actionService, /create_action_occurrence_v1/);
  assert.match(actionService, /p_local_date: occurrenceDate/);
  assert.match(migration, /set\s+daily_plan_id = v_plan\.id/i);
  assert.match(
    migration,
    /candidate\.local_date = p_local_date[\s\S]*candidate\.daily_plan_id is null/i,
  );
  assert.doesNotMatch(
    calendarService,
    /insert\s+into\s+public\.calendar_commitments/i,
  );
});

test("repeating Actions create unassigned Routine definitions and dated occurrences", () => {
  assert.match(migration, /alter column life_area_id drop not null/i);
  assert.match(migration, /create or replace function private\.routine_occurs_on_date/i);
  assert.match(migration, /create or replace function public\.materialize_routine_action_occurrences/i);
  assert.match(
    migration,
    /on public\.daily_actions \(user_id, source_routine_id, local_date\)/i,
  );
  assert.match(
    migration,
    /times_per_week requires a planning choice[\s\S]*else false/i,
  );
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /p_local_date < v_today[\s\S]*cannot be materialized retrospectively/i);
  assert.doesNotMatch(
    migration,
    /insert into public\.daily_actions \(\s*id,\s*user_id,\s*user_id,/i,
  );
  assert.match(
    migration,
    /insert into public\.daily_actions \(\s*id,\s*user_id,\s*daily_plan_id,\s*local_date,/i,
  );
});

test("completed recurrence begins in the future without fabricating historical occurrences", () => {
  assert.match(
    migration,
    /when p_completed and p_recurrence_pattern = 'weekly'[\s\S]*p_local_date \+ 7[\s\S]*when p_completed then p_local_date \+ 1/i,
  );
  assert.match(
    migration,
    /when p_completed then null else p_when_time end/i,
  );
  assert.match(
    migration,
    /case when p_completed then '\{\}'::integer\[\] else v_reminders end/i,
  );
});

test("Due remains on the Action and Calendar projects the same owner-scoped row", () => {
  assert.match(migration, /add column due_local_date date/i);
  assert.match(migration, /add column due_local_time time without time zone/i);
  assert.match(
    calendarService,
    /\.from\("daily_actions"\)[\s\S]*\.eq\("user_id", authenticatedUserId\)[\s\S]*due_local_date\.eq/i,
  );
  assert.match(calendarActions, /title="Due"/);
  assert.match(calendarActions, /\/today\/actions\/\$\{action\.id\}/);
  assert.doesNotMatch(migration, /insert into public\.calendar_commitments/i);
});

test("Action reminders extend the existing queue with exactly one canonical target", () => {
  assert.match(migration, /add column daily_action_id uuid/i);
  assert.match(
    migration,
    /num_nonnulls\(calendar_commitment_id, daily_action_id\) = 1/i,
  );
  assert.match(migration, /notification_deliveries_action_idempotency_key/i);
  assert.match(
    migration,
    /where action\.status in \('proposed','active'\)[\s\S]*not action\.completion_evidence_only/i,
  );
  assert.match(
    migration,
    /v_delivery\.occurrence_date = v_action\.local_date/i,
  );
  assert.match(
    migration,
    /record_notification_delivery_failure[\s\S]*private\.action_notification_delivery_schedule/i,
  );
});

test("all Action creation and editing surfaces share ActionFields contextually", () => {
  for (const source of [addAction, proposedAction, actionWorkspace, completedEvidence]) {
    assert.match(source, /<ActionFields/);
  }
  assert.match(actionFields, /<Field label="What"/);
  assert.match(actionFields, /label="When"/);
  assert.match(actionFields, /label="Duration"/);
  assert.match(actionFields, /label="Due"/);
  assert.match(actionFields, /<RecurrenceControl/);
  assert.match(actionFields, /<CalendarReminderField/);
  assert.match(actionFields, /<DetailsControl/);
  assert.match(completedEvidence, /mode="completed"/);
  assert.match(
    migration,
    /when v_details is not null then 'Context: ' \|\| v_details[\s\S]*when why_it_exists like 'Context: %' then 'Added by the user\.'/i,
  );
});

test("proposal regeneration contains one authoritative local-date guard", () => {
  const functionBody = migration.match(
    /create or replace function public\.save_context_only_proposed_plan[\s\S]*?\$\$;/i,
  )?.[0] ?? "";
  assert.equal(
    functionBody.match(/if p_local_date is distinct from/g)?.length,
    1,
  );
});

test("the dated Action workspace reloads owner-scoped context from one Action ID", () => {
  assert.match(
    workspaceQuery,
    /\.from\("daily_actions"\)[\s\S]*\.eq\("id", actionId\)[\s\S]*\.eq\("user_id", user\.id\)/,
  );
  assert.match(workspaceQuery, /daily_plans!daily_actions_plan_owner_fkey/);
  assert.match(actionWorkspace, /Remove from today/);
  assert.doesNotMatch(actionWorkspace, /per-action chat|new conversation/i);
});

test("the Action workspace prioritizes Done then the persistent Clarity entry", () => {
  const donePosition = actionDetail.indexOf("<ActionCompletionControl");
  const clarityPosition = actionDetail.indexOf("Ask Clarity");
  const detailsPosition = actionDetail.indexOf("{action.details &&");
  assert.ok(donePosition >= 0);
  assert.ok(clarityPosition > donePosition);
  assert.ok(detailsPosition > clarityPosition);
  assert.doesNotMatch(actionDetail, /label: "Routine"/);
});

test("new mutation RPCs are authenticated and not executable by anon", () => {
  for (const signature of [
    "materialize_routine_action_occurrences",
    "create_action_occurrence_v1",
    "update_action_occurrence_v1",
    "update_completed_action_occurrence_v1",
    "remove_action_occurrence_v1",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to authenticated`, "i"),
    );
  }
});
