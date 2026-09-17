import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildClarityMemoryContext,
  CLARITY_MEMORY_READ_LIMITS,
} from "./clarity-memory.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const migration = read(
  "../../../supabase/migrations/20260918000001_clarity_memory_current_state_v1.sql",
);
const service = read("./clarity-memory-service.ts");
const assembler = read("./clarity-context-assembler.ts");
const prompt = read("./clarity-prompt.ts");
const conversationOrchestrator = read("./clarity-conversation-orchestrator.ts");

function row(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    memory_class: "current_state",
    truth_state: "fact",
    topic: "current_reality",
    statement: "Currently testing Memory V1",
    confidence: "high",
    materiality: "medium",
    observed_at: "2026-09-01T00:00:00.000Z",
    effective_on: null,
    review_after: "2026-10-01T00:00:00.000Z",
    confirmed_at: "2026-09-01T00:00:00.000Z",
    clarity_memory_item_sources: [
      { source_type: "onboarding_confirmation" },
    ],
    ...overrides,
  };
}

test("the ledger is owner scoped, forced-RLS, and not directly writable", () => {
  assert.match(migration, /create table public\.clarity_memory_items/);
  assert.match(migration, /create table public\.clarity_memory_item_sources/);
  assert.match(
    migration,
    /alter table public\.clarity_memory_items force row level security/,
  );
  assert.match(
    migration,
    /alter table public\.clarity_memory_item_sources force row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.clarity_memory_items[\s\S]*grant select on table public\.clarity_memory_items to authenticated/,
  );
  assert.match(
    migration,
    /foreign key \(superseded_by_item_id, user_id\)[\s\S]*references public\.clarity_memory_items\(id, user_id\)/,
  );
  assert.match(migration, /superseded_by_item_id <> id/);
});

test("confirmed onboarding seeds atomically and idempotently", () => {
  assert.match(
    migration,
    /create function private\.seed_confirmed_onboarding_memory_v1/,
  );
  assert.match(
    migration,
    /create or replace function public\.confirm_onboarding_understanding_v1[\s\S]*perform private\.seed_confirmed_onboarding_memory_v1/,
  );
  assert.match(
    migration,
    /unique index clarity_memory_items_onboarding_origin_key/,
  );
  assert.match(
    migration,
    /on conflict \(user_id, origin_onboarding_session_id, origin_key\)/,
  );
  assert.match(
    migration,
    /where session\.status = 'completed'[\s\S]*session\.confirmed_snapshot is not null[\s\S]*seed_confirmed_onboarding_memory_v1/,
  );
  assert.match(migration, /truthState/);
  assert.match(migration, /evidenceMessageIds/);
  assert.match(migration, /v_entry\.value ->> 'materiality'/);
});

test("Stage A promotes to Profile and is not represented as generic memory", () => {
  assert.match(
    migration,
    /name = btrim\(v_basic_context ->> 'preferred_name'\)/,
  );
  assert.match(migration, /date_of_birth = v_date_of_birth/);
  assert.match(migration, /timezone = v_basic_context ->> 'timezone'/);
  assert.doesNotMatch(
    migration,
    /insert_onboarding_memory_item_v1\([\s\S]{0,300}preferred_name/,
  );
});

test("classification uses category defaults plus claim-level temporal evidence", () => {
  assert.match(migration, /classify_onboarding_memory_v1/);
  assert.match(migration, /previously\|used to\|work\(ed\)\? as/);
  assert.match(migration, /currently\|right now\|at the moment\|unemployed/);
  assert.match(
    migration,
    /'desiredFuture',[\s\S]*'capabilitiesAndAssets',[\s\S]*'behavioralEvidence'/,
  );
});

test("current-state freshness is based on reviewAfter, never updatedAt", () => {
  const context = buildClarityMemoryContext(
    [
      row({ id: "fresh", review_after: "2026-09-20T00:00:00.000Z" }),
      row({ id: "stale", review_after: "2026-09-10T00:00:00.000Z" }),
      row({
        id: "durable",
        memory_class: "durable_memory",
        observed_at: null,
        review_after: null,
      }),
    ],
    new Date("2026-09-18T00:00:00.000Z"),
  );

  assert.deepEqual(context.currentState.map((item) => item.id), ["fresh"]);
  assert.deepEqual(context.staleCurrentState.map((item) => item.id), ["stale"]);
  assert.equal(context.durableMemory[0]?.freshness, "durable");
  assert.doesNotMatch(service, /updated_at/);
});

test("bounded reads prioritize material items and keep unknowns explicit", () => {
  const rows = Array.from({ length: 22 }, (_, index) =>
    row({
      id: `durable-${index.toString().padStart(2, "0")}`,
      memory_class: "durable_memory",
      observed_at: null,
      review_after: null,
      materiality: index === 21 ? "high" : "low",
    }),
  );
  rows.push(
    row({
      id: "unknown-high",
      truth_state: "unknown",
      materiality: "high",
    }),
    row({
      id: "unknown-low",
      truth_state: "unknown",
      materiality: "low",
    }),
  );

  const context = buildClarityMemoryContext(rows);
  assert.equal(context.durableMemory.length, CLARITY_MEMORY_READ_LIMITS.durableMemory);
  assert.equal(context.durableMemory[0]?.id, "durable-21");
  assert.deepEqual(context.materialUnknowns.map((item) => item.id), [
    "unknown-high",
  ]);
  assert.equal(context.omissions.durableMemory, 6);
});

test("normal Clarity receives Memory read-only with canonical source precedence", () => {
  assert.match(service, /\.eq\("status", "active"\)/);
  assert.match(service, /\.eq\("user_id", userId\)/);
  assert.match(service, /\.limit\(MAX_MEMORY_ROWS_FOR_BOUNDING\)/);
  assert.doesNotMatch(service, /\bcontent\b|user_draft|structured_output/);
  assert.match(assembler, /loadClarityMemoryContext\(supabase, user\.id\)/);
  assert.match(assembler, /memory: ClarityMemoryContext/);
  assert.match(prompt, /Canonical Profile, Life, Current Direction, Today, Calendar, Actions/);
  assert.match(prompt, /outrank a conflicting Memory item/);
  assert.match(prompt, /stale Current State as last-known context/);
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  assert.doesNotMatch(
    conversationOrchestrator,
    /supersede_clarity_memory|retract_clarity_memory|clarity_memory_items/,
  );
});

test("supersession and retraction retain history without weakening facts", () => {
  assert.match(migration, /create function public\.supersede_clarity_memory_item_v1/);
  assert.match(migration, /An inference cannot supersede a fact\./);
  assert.match(
    migration,
    /status = 'superseded'[\s\S]*superseded_by_item_id = v_new_id/,
  );
  assert.match(migration, /create function public\.retract_clarity_memory_item_v1/);
  assert.match(
    migration,
    /status = 'retracted'[\s\S]*superseded_by_item_id = null/,
  );
});
