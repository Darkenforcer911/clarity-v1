import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { completedPlanEvidenceInputSchema } from "./completed-plan-evidence.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260904000001_completed_plan_evidence_fields.sql",
    import.meta.url,
  ),
  "utf8",
);
const formSource = readFileSync(
  new URL("../../components/clarity/so-far-today.tsx", import.meta.url),
  "utf8",
);
const serviceSource = readFileSync(
  new URL("./proposed-reconciliation-service.ts", import.meta.url),
  "utf8",
);
const calendarServiceSource = readFileSync(
  new URL("./calendar-service.ts", import.meta.url),
  "utf8",
);
const calendarHistorySource = readFileSync(
  new URL("../../components/clarity/calendar-history.tsx", import.meta.url),
  "utf8",
);

test("completed evidence accepts title-only input and keeps optional evidence unknown", () => {
  assert.deepEqual(
    completedPlanEvidenceInputSchema.parse({
      title: "  Walked to the shops  ",
      completedTime: "",
      actualMinutes: "",
      details: "",
    }),
    {
      title: "Walked to the shops",
      completedTime: null,
      actualMinutes: null,
      dueLocalDate: null,
      dueLocalTime: null,
      recurrencePattern: "none",
      recurrenceDays: [],
      reminderOffsets: [],
      details: null,
    },
  );
});

test("completed evidence accepts explicit time, actual duration, and details", () => {
  assert.deepEqual(
    completedPlanEvidenceInputSchema.parse({
      title: "Walked to the shops",
      completedTime: "18:15",
      actualMinutes: "75",
      details: "  Picked up groceries too.  ",
    }),
    {
      title: "Walked to the shops",
      completedTime: "18:15",
      actualMinutes: 75,
      dueLocalDate: null,
      dueLocalTime: null,
      recurrencePattern: "none",
      recurrenceDays: [],
      reminderOffsets: [],
      details: "Picked up groceries too.",
    },
  );
});

test("actual duration enforces the canonical one minute to 24 hour range", () => {
  for (const invalid of ["0", "1441", "2.5", "nope"]) {
    assert.equal(
      completedPlanEvidenceInputSchema.safeParse({
        title: "Walked",
        completedTime: "",
        actualMinutes: invalid,
        details: "",
      }).success,
      false,
    );
  }
  for (const valid of ["1", "45", "1440"]) {
    assert.equal(
      completedPlanEvidenceInputSchema.safeParse({
        title: "Walked",
        completedTime: "",
        actualMinutes: valid,
        details: "",
      }).success,
      true,
    );
  }
});

test("migration stores explicit evidence fields without repurposing estimates", () => {
  assert.match(migration, /add column actual_minutes integer/i);
  assert.match(migration, /add column details text/i);
  assert.match(migration, /actual_minutes between 1 and 1440/i);
  assert.match(migration, /char_length\(btrim\(details\)\) between 1 and 2000/i);
  assert.match(migration, /completion_evidence_only\s+and actual_minutes between/i);
  assert.doesNotMatch(migration, /estimated_minutes\s*=\s*p_actual_minutes/i);
});

test("create and update RPCs preserve ownership, date, and evidence-only guards", () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /where id = p_daily_plan_id\s+and user_id = v_user_id\s+for update/i);
  assert.match(migration, /where id = p_daily_action_id\s+and user_id = v_user_id\s+for update/i);
  assert.match(migration, /v_plan\.local_date <> \(v_recorded_at at time zone v_timezone\)::date/i);
  assert.match(migration, /or not v_action\.completion_evidence_only/i);
  assert.match(migration, /grant execute on function public\.create_completed_plan_evidence[\s\S]*to authenticated/i);
  assert.match(migration, /grant execute on function public\.update_completed_plan_evidence[\s\S]*to authenticated/i);
  assert.match(migration, /revoke all on function public\.create_completed_plan_evidence[\s\S]*from public, anon/i);
});

test("RPC payloads explicitly carry actual duration and details", () => {
  assert.match(serviceSource, /p_actual_minutes: input\.actualMinutes/);
  assert.match(serviceSource, /p_details: input\.details/);
  assert.match(migration, /actual_minutes = p_actual_minutes/);
  assert.match(migration, /details = v_details/);
});

test("completed evidence UI uses shared fields and canonical deletion", () => {
  assert.match(formSource, /<ActionFields/);
  assert.match(formSource, /mode="completed"/);
  assert.match(formSource, /<SwipeToRemove/);
  assert.match(formSource, /deleteCompletedPlanEvidenceAction\(formData\)/);
  assert.match(formSource, /action\.completion_evidence_only/);
  assert.doesNotMatch(formSource, /Completion time — optional/);
  assert.doesNotMatch(formSource, /Repeats/);
});

test("delete mutation remains restricted to evidence-only proposed rows", () => {
  const originalMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20260807000001_proposed_plan_reconciliation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    originalMigration,
    /create function public\.delete_completed_plan_evidence[\s\S]*or not v_action\.completion_evidence_only[\s\S]*delete from public\.daily_actions where id = v_action\.id/i,
  );
});

test("Calendar enriches matching evidence IDs and renders duration and details", () => {
  assert.match(calendarServiceSource, /action\.completion_evidence_only/);
  assert.match(calendarServiceSource, /actualMinutes: action\.actual_minutes/);
  assert.match(calendarServiceSource, /details: action\.details/);
  assert.match(calendarHistorySource, /record\.completedEvidence\[item\.id\]/);
  assert.match(calendarHistorySource, /evidence\?\.actualMinutes/);
  assert.match(calendarHistorySource, /detail=\{evidence\?\.details\}/);
});
