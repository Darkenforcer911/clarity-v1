import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseLifeModel } from "./life-model.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260826000002_onboarding_life_model_foundation_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

const id = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function functionBody(name) {
  const start = migration.search(
    new RegExp(`create (?:or replace )?function public\\.${name}\\b`, "i"),
  );
  assert.notEqual(start, -1, `${name} must exist`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return migration.slice(start, end);
}

test("the migration adds focused canonical and workflow entities without a fact graph", () => {
  for (const table of [
    "life_area_desired_states",
    "life_open_questions",
    "current_directions",
    "current_direction_goals",
    "life_model_change_proposals",
    "onboarding_sessions",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`, "i"));
  }

  assert.doesNotMatch(
    migration,
    /create table public\.(facts|attributes|entity_values|user_profile_facts)\b/i,
  );
  assert.doesNotMatch(migration, /chain[_ -]?of[_ -]?thought|hidden_reasoning/i);
});

test("new owned tables are forced-RLS read models with RPC-only writes", () => {
  for (const table of [
    "life_area_desired_states",
    "life_open_questions",
    "current_directions",
    "current_direction_goals",
    "life_model_change_proposals",
    "onboarding_sessions",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`, "i"),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table} from public, anon, authenticated`,
        "i",
      ),
    );
  }

  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete|all).*on\s+(table\s+)?public\.(life_area_desired_states|life_open_questions|current_directions|current_direction_goals|life_model_change_proposals|onboarding_sessions)/i,
  );
});

test("canonical and workflow RPCs authenticate and scope mutations to their owner", () => {
  for (const name of [
    "set_life_area_desired_state",
    "create_life_open_question",
    "update_life_open_question",
    "transition_life_open_question",
    "set_current_direction",
    "supersede_current_direction",
    "save_onboarding_session",
    "abandon_onboarding_session",
    "create_life_model_change_proposal",
    "reject_life_model_change_proposal",
    "confirm_life_model_change_proposal",
  ]) {
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

  assert.match(
    migration,
    /foreign key \(source_proposal_id, user_id\)[\s\S]*references public\.life_model_change_proposals\(id, user_id\)/i,
  );
});

test("AI-confirmed canonical writes require an accepted owned proposal", () => {
  const body = migration.slice(
    migration.indexOf("create or replace function private.enforce_confirmed_life_model_provenance"),
    migration.indexOf("\n$$;", migration.indexOf("create or replace function private.enforce_confirmed_life_model_provenance")),
  );
  assert.match(body, /new\.created_via = 'ai_confirmed'/i);
  assert.match(body, /new\.source_proposal_id is null/i);
  assert.match(body, /user_id = new\.user_id/i);
  assert.match(body, /status = 'accepted'/i);
  assert.match(migration, /life_areas_confirmed_provenance/i);
  assert.match(migration, /life_area_desired_states_confirmed_provenance/i);
  assert.match(migration, /life_open_questions_confirmed_provenance/i);
  assert.match(migration, /current_directions_confirmed_provenance/i);
});

test("proposal payloads persist only explicit supported operations", () => {
  const validatorStart = migration.indexOf(
    "create or replace function private.assert_life_model_change_proposal_shape",
  );
  const validator = migration.slice(
    validatorStart,
    migration.indexOf("\n$$;", validatorStart),
  );
  assert.match(validator, /may contain only an operations array/i);
  assert.match(validator, /contains unsupported fields/i);
  for (const operation of [
    "create_life_area",
    "set_current_state",
    "set_desired_state",
    "create_goal",
    "create_project",
    "create_routine",
    "create_current_context",
    "create_open_question",
    "set_current_direction",
  ]) {
    assert.match(validator, new RegExp(`'${operation}'`), operation);
  }
});

test("proposal confirmation is owned, idempotent, atomic, and completes onboarding", () => {
  const body = functionBody("confirm_life_model_change_proposal");
  assert.match(body, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(body, /user_id = v_user_id[\s\S]*for update/i);
  assert.match(body, /if v_proposal\.status = 'accepted'[\s\S]*return v_proposal\.confirmation_result/i);
  assert.match(body, /status = 'accepted'[\s\S]*confirmation_result = '\{\}'::jsonb/i);
  assert.match(body, /'ai_confirmed'[\s\S]*v_proposal\.id/i);
  assert.match(body, /update public\.onboarding_sessions[\s\S]*status = 'completed'/i);
  assert.match(body, /status = 'completed'[\s\S]*user_draft = '\{\}'::jsonb/i);
  assert.match(body, /update public\.profiles[\s\S]*onboarding_completed = true/i);
  assert.doesNotMatch(body, /insert into public\.(daily_actions|daily_plans|life_evidence)/i);
});

test("rejected and abandoned workflow state never writes canonical data", () => {
  const reject = functionBody("reject_life_model_change_proposal");
  const abandon = functionBody("abandon_onboarding_session");
  assert.match(reject, /status = 'rejected'/i);
  assert.match(abandon, /status = 'superseded'/i);
  assert.match(abandon, /status = 'abandoned'/i);
  for (const body of [reject, abandon]) {
    assert.doesNotMatch(
      body,
      /insert into public\.(life_areas|life_area_current_states|life_area_desired_states|goals|projects|routines|current_contexts|life_open_questions|current_directions)/i,
    );
  }
});

test("open questions are explicit unknowns with terminal resolution", () => {
  const transition = functionBody("transition_life_open_question");
  assert.match(transition, /v_status <> 'open'/i);
  assert.match(transition, /cannot be reopened/i);
  assert.match(transition, /p_new_status not in \('resolved', 'dismissed'\)/i);
  assert.match(transition, /A resolution summary is required/i);
});

test("Current Direction is accepted strategy with stable ordered Goals", () => {
  const body = functionBody("set_current_direction");
  assert.match(body, /requires at least one Goal/i);
  assert.match(body, /cannot contain duplicate IDs/i);
  assert.match(body, /status in \('exploring', 'active'\)/i);
  assert.match(body, /set superseded_at = clock_timestamp\(\)/i);
  assert.match(body, /unnest\(p_goal_ids\) with ordinality/i);
  assert.match(body, /\(ordered\.ordinality - 1\)::integer/i);
});

test("expanded canonical read model includes desired state, open questions, and direction", () => {
  assert.match(migration, /create or replace function public\.get_life_model\(\)/i);
  assert.match(migration, /'desiredState'/i);
  assert.match(migration, /'openQuestions'/i);
  assert.match(migration, /'currentDirection'/i);
  assert.match(migration, /direction_goal\.sort_order/i);

  const areaId = id("1");
  const goalId = id("2");
  const parsed = parseLifeModel({
    areas: [
      {
        id: areaId,
        name: "Career",
        status: "active",
        sort_order: 0,
        created_via: "user_stated",
        source_proposal_id: null,
        created_at: "2026-08-26T00:00:00Z",
        updated_at: "2026-08-26T00:00:00Z",
        archived_at: null,
        currentState: null,
        desiredState: {
          summary: "Work in a role with more ownership.",
          target_start_date: "2027-01-01",
          target_end_date: "2027-12-31",
          target_confidence: "aspirational",
          created_via: "user_stated",
          source_proposal_id: null,
          confirmed_at: "2026-08-26T00:00:00Z",
          created_at: "2026-08-26T00:00:00Z",
          updated_at: "2026-08-26T00:00:00Z",
        },
        goals: [],
        projects: [],
        routines: [],
        currentContexts: [],
        openQuestions: [],
        evidence: [],
      },
    ],
    openQuestions: [
      {
        id: id("3"),
        life_area_id: null,
        question: "Where do I want to live?",
        context: null,
        status: "open",
        resolution_summary: null,
        created_via: "user_stated",
        source_proposal_id: null,
        resolved_at: null,
        created_at: "2026-08-26T00:00:00Z",
        updated_at: "2026-08-26T00:00:00Z",
      },
    ],
    currentDirection: {
      id: id("4"),
      summary: "Test a move into infrastructure work.",
      rationale: "It builds on current support experience.",
      started_on: "2026-08-26",
      review_on: null,
      created_via: "user_stated",
      source_proposal_id: null,
      confirmed_at: "2026-08-26T00:00:00Z",
      superseded_at: null,
      created_at: "2026-08-26T00:00:00Z",
      updated_at: "2026-08-26T00:00:00Z",
      goals: [
        {
          goalId,
          sortOrder: 0,
          lifeAreaId: areaId,
          title: "Explore infrastructure roles",
          status: "exploring",
        },
      ],
    },
    relationships: { dailyActions: [], calendarCommitments: [] },
  });

  assert.equal(parsed.areas[0].desiredState?.summary, "Work in a role with more ownership.");
  assert.equal(parsed.openQuestions[0].status, "open");
  assert.equal(parsed.currentDirection?.goals[0].goalId, goalId);
});
