import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeCalendarCommitmentReadModel } from "./calendar-commitment-read-model.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260819000002_fix_calendar_undo_capability_flag.sql",
    import.meta.url,
  ),
  "utf8",
);
const commitmentsSource = readFileSync(
  new URL("./calendar-commitments.ts", import.meta.url),
  "utf8",
);
const completionHistoryMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260819000001_calendar_occurrence_completion_history.sql",
    import.meta.url,
  ),
  "utf8",
);

test("legacy rows without an undo capability normalize to false", () => {
  assert.deepEqual(normalizeCalendarCommitmentReadModel([{ id: "legacy" }]), [
    { id: "legacy", can_undo_completion: false },
  ]);
});

test("unresolved occurrence null capability normalizes to false", () => {
  assert.deepEqual(
    normalizeCalendarCommitmentReadModel([
      { id: "unresolved", can_undo_completion: null },
    ]),
    [{ id: "unresolved", can_undo_completion: false }],
  );
});

test("a stable occurrence cleared to Not recorded reads as unresolved", () => {
  assert.deepEqual(
    normalizeCalendarCommitmentReadModel([
      {
        id: "commitment",
        status: "completed",
        occurrence_id: "occurrence",
        reconciliation_outcome: null,
        can_undo_completion: false,
      },
    ]),
    [
      {
        id: "commitment",
        status: "scheduled",
        occurrence_id: "occurrence",
        reconciliation_outcome: null,
        can_undo_completion: false,
      },
    ],
  );
});

test("a genuinely correctable completion remains true", () => {
  assert.deepEqual(
    normalizeCalendarCommitmentReadModel([
      { id: "completed", can_undo_completion: true },
    ]),
    [{ id: "completed", can_undo_completion: true }],
  );
});

test("malformed non-boolean values are not hidden by compatibility normalization", () => {
  assert.deepEqual(
    normalizeCalendarCommitmentReadModel([
      { id: "bad", can_undo_completion: "yes" },
    ]),
    [{ id: "bad", can_undo_completion: "yes" }],
  );
  assert.match(commitmentsSource, /can_undo_completion: z\.boolean\(\)/);
  assert.doesNotMatch(
    commitmentsSource,
    /can_undo_completion: z\.boolean\(\)\.nullable/,
  );
});

test("the Calendar parser normalizes before strict Zod validation", () => {
  assert.match(
    commitmentsSource,
    /\.parse\(normalizeCalendarCommitmentReadModel\(value\)\)/,
  );
});

test("the canonical SQL read boundary always emits a boolean", () => {
  assert.match(
    migration,
    /'can_undo_completion', coalesce\(\s*occurrence\.outcome = 'attended',\s*false\s*\)/i,
  );
});

test("the forward fix leaves completion-history behaviour unchanged", () => {
  assert.doesNotMatch(migration, /alter table|create table|undo_calendar_event_completion/i);
  assert.match(completionHistoryMigration, /add column completed_at timestamptz/i);
  assert.match(
    completionHistoryMigration,
    /create table public\.calendar_commitment_occurrence_revisions/i,
  );
  assert.match(
    completionHistoryMigration,
    /create function public\.undo_calendar_event_completion/i,
  );
});
