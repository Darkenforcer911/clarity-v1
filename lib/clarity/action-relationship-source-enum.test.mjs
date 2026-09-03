import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const convergenceMigration = read(
  "../../supabase/migrations/20260904000002_action_occurrence_convergence_v1.sql",
);
const repairMigration = read(
  "../../supabase/migrations/20260904000003_fix_action_relationship_source_enum.sql",
);
const actionService = read("./action-workspace-service.ts");
const completedService = read("./proposed-reconciliation-service.ts");

const functionBody = (source, name) =>
  source.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  )?.[0] ?? "";

const createAction = functionBody(repairMigration, "create_action_occurrence_v1");
const updateCompleted = functionBody(
  repairMigration,
  "update_completed_action_occurrence_v1",
);
const materializeRoutine = functionBody(
  convergenceMigration,
  "materialize_routine_action_occurrences",
);

test("ordinary unlinked Actions persist NULL relationship provenance", () => {
  assert.match(
    createAction,
    /v_relationship_source public\.life_model_provenance/i,
  );
  assert.match(
    createAction,
    /when v_routine_id is null then null[\s\S]*else 'user_stated'::public\.life_model_provenance/i,
  );
  assert.match(
    createAction,
    /source_routine_id,[\s\S]*relationship_source[\s\S]*v_routine_id,[\s\S]*v_relationship_source/i,
  );
});

test("Routine-backed Actions use validated enum provenance", () => {
  assert.match(
    createAction,
    /else 'user_stated'::public\.life_model_provenance/i,
  );
  assert.match(
    updateCompleted,
    /else 'user_stated'::public\.life_model_provenance/i,
  );
  assert.match(
    materializeRoutine,
    /routine\.id,[\s\S]*routine\.created_via/i,
  );
});

test("Action occurrence RPCs do not accept or cast arbitrary provenance text", () => {
  assert.doesNotMatch(createAction, /p_relationship_source/i);
  assert.doesNotMatch(updateCompleted, /p_relationship_source/i);
  assert.doesNotMatch(
    repairMigration,
    /p_relationship_source\s*::\s*public\.life_model_provenance/i,
  );
  assert.doesNotMatch(
    repairMigration,
    /relationship_source\s*=\s*case[\s\S]{0,160}else\s+'user_stated'\s+end/i,
  );
});

test("future, completed, and repeating creation retain one canonical RPC", () => {
  assert.match(actionService, /create_action_occurrence_v1/);
  assert.match(actionService, /p_local_date: occurrenceDate/);
  assert.match(actionService, /p_recurrence_pattern: input\.recurrencePattern/);
  assert.match(completedService, /create_action_occurrence_v1/);
  assert.match(completedService, /p_completed: true/);
  assert.match(completedService, /p_completion_evidence_only: true/);
  assert.match(createAction, /if p_local_date > v_today/i);
  assert.match(createAction, /if p_recurrence_pattern <> 'none'/i);
});

test("relationship ownership remains authenticated and cannot be supplied cross-user", () => {
  assert.match(createAction, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    createAction,
    /where plan\.id = p_daily_plan_id[\s\S]*plan\.user_id = v_user_id[\s\S]*for update/i,
  );
  assert.match(
    createAction,
    /insert into public\.routines[\s\S]*values \([\s\S]*v_user_id,[\s\S]*null,[\s\S]*v_title/i,
  );
  assert.doesNotMatch(createAction, /p_(?:life_area|goal|project|routine)_id/i);
  assert.match(
    materializeRoutine,
    /from public\.routines as routine[\s\S]*routine\.user_id = v_user_id/i,
  );
});

test("the repair preserves authenticated-only execution", () => {
  for (const name of [
    "create_action_occurrence_v1",
    "update_completed_action_occurrence_v1",
  ]) {
    assert.match(
      repairMigration,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated`, "i"),
    );
    assert.match(
      repairMigration,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to authenticated`, "i"),
    );
  }
});
