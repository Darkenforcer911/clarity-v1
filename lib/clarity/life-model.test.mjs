import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseLifeModel } from "./life-model.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260818000001_life_model_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

const id = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

test("the read model accepts an empty confirmed Life Model", () => {
  assert.deepEqual(
    parseLifeModel({
      areas: [],
      relationships: { dailyActions: [], calendarCommitments: [] },
    }),
    {
      areas: [],
      relationships: { dailyActions: [], calendarCommitments: [] },
    },
  );
});

test("the read model keeps baseline state separate from temporary context", () => {
  const areaId = id("1");
  const contextId = id("2");
  const parsed = parseLifeModel({
    areas: [
      {
        id: areaId,
        name: "Career",
        status: "active",
        sort_order: 0,
        created_via: "user_stated",
        created_at: "2026-08-18T00:00:00Z",
        updated_at: "2026-08-18T00:00:00Z",
        archived_at: null,
        currentState: {
          summary: "Works full-time in IT support.",
          as_of_date: "2026-08-18",
          created_via: "user_stated",
          source_proposal_id: null,
          confirmed_at: "2026-08-18T00:00:00Z",
          created_at: "2026-08-18T00:00:00Z",
          updated_at: "2026-08-18T00:00:00Z",
        },
        goals: [],
        projects: [],
        routines: [],
        currentContexts: [
          {
            id: contextId,
            life_area_id: areaId,
            title: "Notice period",
            planning_impact: "Job-search work is temporarily urgent.",
            status: "active",
            started_on: "2026-08-01",
            expected_end_start: "2026-09-01",
            expected_end_end: "2026-09-15",
            ended_on: null,
            created_via: "user_stated",
            source_proposal_id: null,
            created_at: "2026-08-18T00:00:00Z",
            updated_at: "2026-08-18T00:00:00Z",
          },
        ],
        evidence: [],
      },
    ],
    relationships: { dailyActions: [], calendarCommitments: [] },
  });

  assert.equal(parsed.areas[0].currentState?.summary, "Works full-time in IT support.");
  assert.equal(parsed.areas[0].currentContexts[0].title, "Notice period");
});

test("the migration creates the approved ontology without Milestones or EAV", () => {
  for (const table of [
    "life_areas",
    "life_area_current_states",
    "goals",
    "goal_decisions",
    "projects",
    "routines",
    "current_contexts",
    "life_evidence",
    "daily_action_current_contexts",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`, "i"));
  }

  assert.doesNotMatch(migration, /create table public\.milestones\b/i);
  assert.doesNotMatch(migration, /create table public\.(facts|attributes|entity_values)\b/i);
});

test("current state is one-to-one and canonical AI rows require a proposal", () => {
  assert.match(
    migration,
    /create table public\.life_area_current_states\s*\(\s*life_area_id uuid primary key/i,
  );
  assert.match(
    migration,
    /life_area_current_states_proposal_source[\s\S]*\(created_via = 'ai_confirmed'\) = \(source_proposal_id is not null\)/i,
  );
});

test("owned tables use forced RLS and authenticated controlled writes", () => {
  for (const table of [
    "life_areas",
    "life_area_current_states",
    "goals",
    "goal_decisions",
    "projects",
    "routines",
    "current_contexts",
    "life_evidence",
    "daily_action_current_contexts",
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

  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    migration,
    /grant execute on function public\.get_life_model\(\)\s+to authenticated/i,
  );
});

test("stable Action and Calendar relationships are additive and ownership-safe", () => {
  assert.match(
    migration,
    /alter table public\.daily_actions[\s\S]*add column life_area_id uuid[\s\S]*add column source_routine_id uuid/i,
  );
  assert.match(
    migration,
    /foreign key \(source_calendar_commitment_id, user_id\)[\s\S]*references public\.calendar_commitments\(id, user_id\)/i,
  );
  assert.match(
    migration,
    /alter table public\.calendar_commitments[\s\S]*add column current_context_id uuid/i,
  );
  assert.match(
    migration,
    /foreign key \(current_context_id, user_id\)[\s\S]*references public\.current_contexts\(id, user_id\)/i,
  );
  assert.doesNotMatch(migration, /update public\.daily_actions\s+set\s+context_label/i);
});

test("evidence stays selective and references at most one raw operational source", () => {
  assert.match(
    migration,
    /life_evidence_single_raw_source[\s\S]*num_nonnulls\([\s\S]*source_daily_action_id,[\s\S]*source_calendar_occurrence_id,[\s\S]*source_day_correction_id[\s\S]*\) <= 1/i,
  );
});

test("the server read service uses the generated Life Model RPC type", () => {
  const service = readFileSync(
    new URL("./life-model-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /getAuthenticatedUserAndProfile\(\)/);
  assert.match(service, /supabase\.rpc\("get_life_model"\)/);
  assert.doesNotMatch(service, /PendingLifeModelRpcClient|as unknown as/);
  assert.match(service, /parseLifeModel\(data\)/);
});
