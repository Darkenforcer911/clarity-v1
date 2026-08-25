import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260826000001_life_model_canonical_mutations_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
const foundation = readFileSync(
  new URL(
    "../../supabase/migrations/20260818000001_life_model_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

const functionNames = [
  "rename_life_area",
  "reorder_life_areas",
  "archive_life_area",
  "update_goal",
  "transition_goal_status",
  "update_project",
  "transition_project_status",
  "update_routine",
  "transition_routine_status",
  "update_current_context",
  "end_current_context",
  "correct_life_evidence",
  "archive_life_evidence",
];

function functionBody(name) {
  const start = migration.indexOf(`create function public.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return migration.slice(start, end);
}

test("every mutation is authenticated, ownership scoped, and execute-only", () => {
  for (const name of functionNames) {
    const body = functionBody(name);
    assert.match(body, /v_user_id uuid := auth\.uid\(\)/i, name);
    assert.match(body, /v_user_id is null/i, name);
    assert.match(body, /user_id = v_user_id/i, name);
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\(`, "i"),
      name,
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\(`, "i"),
      name,
    );
  }

  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete|all).*on\s+(table\s+)?public\.(life_areas|goals|projects|routines|current_contexts|life_evidence)/i,
  );
});

test("Life Area ordering is authoritative, owned, unique, and atomic", () => {
  const body = functionBody("reorder_life_areas");
  assert.match(body, /array_position\(p_ordered_life_area_ids, null\)/i);
  assert.match(body, /count\(distinct area_id\)/i);
  assert.match(body, /status = 'active'[\s\S]*for update/i);
  assert.match(body, /must contain every active owned Life Area exactly once/i);
  assert.match(
    body,
    /set sort_order = \(ordered\.ordinality - 1\)::integer[\s\S]*unnest\(p_ordered_life_area_ids\) with ordinality/i,
  );
});

test("Life Area archival blocks every active canonical child type", () => {
  const body = functionBody("archive_life_area");
  assert.match(body, /from public\.goals[\s\S]*status in \('exploring', 'active'\)/i);
  assert.match(body, /from public\.projects[\s\S]*status in \('planned', 'active', 'paused'\)/i);
  assert.match(body, /from public\.routines[\s\S]*status in \('active', 'paused'\)/i);
  assert.match(body, /from public\.current_contexts[\s\S]*status = 'active'/i);
  assert.match(body, /status = 'archived'[\s\S]*archived_at = clock_timestamp\(\)/i);
});

test("Goal transitions are exhaustive, terminal, and append an atomic decision", () => {
  const body = functionBody("transition_goal_status");
  assert.match(body, /status = 'exploring' and p_new_status = 'active'[\s\S]*'committed'/i);
  assert.match(body, /status in \('exploring', 'active'\) and p_new_status = 'achieved'[\s\S]*'achieved'/i);
  assert.match(body, /p_new_status = 'abandoned'[\s\S]*'abandoned'[\s\S]*'replaced'/i);
  assert.match(body, /Terminal Goals cannot be reopened or transitioned/i);
  assert.match(body, /rationale is required to abandon or replace a Goal/i);
  assert.match(body, /Replacement Goal not found or is terminal/i);
  assert.match(body, /update public\.goals[\s\S]*insert into public\.goal_decisions/i);
  assert.match(body, /archived_at = case[\s\S]*\('achieved', 'abandoned'\)/i);
});

test("Project and Routine transition graphs reject unsupported and terminal changes", () => {
  const project = functionBody("transition_project_status");
  assert.match(project, /v_old_status = 'active' and p_new_status = 'paused'/i);
  assert.match(project, /v_old_status = 'paused' and p_new_status = 'active'/i);
  assert.match(project, /v_old_status in \('active', 'paused'\)[\s\S]*p_new_status in \('completed', 'cancelled'\)/i);
  assert.match(project, /Terminal Projects cannot be reopened or transitioned/i);
  assert.match(project, /archived_at = case[\s\S]*\('completed', 'cancelled'\)/i);

  const routine = functionBody("transition_routine_status");
  assert.match(routine, /v_old_status = 'active' and p_new_status = 'paused'/i);
  assert.match(routine, /v_old_status = 'paused' and p_new_status = 'active'/i);
  assert.match(routine, /v_old_status in \('active', 'paused'\) and p_new_status = 'ended'/i);
  assert.match(routine, /Ended Routines cannot be resumed or transitioned/i);
  assert.match(routine, /ended_at = case[\s\S]*p_new_status = 'ended'/i);
});

test("Current Context ending defaults to the authenticated profile-local date", () => {
  const body = functionBody("end_current_context");
  assert.match(body, /select timezone[\s\S]*from public\.profiles[\s\S]*id = v_user_id/i);
  assert.match(
    body,
    /coalesce\([\s\S]*p_ended_on,[\s\S]*clock_timestamp\(\) at time zone v_timezone[\s\S]*::date/i,
  );
  assert.match(body, /Ended Current Contexts cannot be reopened or transitioned/i);
  assert.match(body, /v_ended_on < v_context\.started_on/i);
});

test("Evidence correction cannot rewrite ownership, relationships, or provenance", () => {
  const body = functionBody("correct_life_evidence");
  assert.match(body, /set[\s\S]*summary = btrim\(p_summary\)[\s\S]*occurred_on = p_occurred_on[\s\S]*signal = p_signal/i);
  assert.doesNotMatch(body, /life_area_id\s*=|goal_id\s*=|project_id\s*=|source_\w+_id\s*=|created_via\s*=/i);
  assert.match(body, /Archived Life Evidence cannot be changed/i);

  const archive = functionBody("archive_life_evidence");
  assert.match(archive, /set archived_at = clock_timestamp\(\)/i);
  assert.doesNotMatch(archive, /delete from public\.life_evidence/i);
  assert.doesNotMatch(migration, /create function public\.restore_life_evidence/i);
});

test("terminal and archived entities remain outside the canonical active read model", () => {
  assert.match(foundation, /area\.status = 'active'/i);
  assert.match(foundation, /goal_row\.status in \('exploring', 'active'\)[\s\S]*goal_row\.archived_at is null/i);
  assert.match(foundation, /project_row\.status in \('planned', 'active', 'paused'\)[\s\S]*project_row\.archived_at is null/i);
  assert.match(foundation, /routine_row\.status in \('active', 'paused'\)/i);
  assert.match(foundation, /context_row\.status = 'active'/i);
  assert.match(foundation, /evidence_row\.archived_at is null/i);
  assert.doesNotMatch(
    migration,
    /delete from public\.(life_areas|goals|goal_decisions|projects|routines|current_contexts|life_evidence)/i,
  );
});
