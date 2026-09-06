import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../../components/clarity/calendar-occurrence-workspace.tsx", import.meta.url),
  "utf8",
);
const actions = readFileSync(
  new URL("../../app/(app)/calendar/actions.ts", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("./calendar-service.ts", import.meta.url),
  "utf8",
);
const correctionMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260825000004_allow_current_day_occurrence_correction.sql",
    import.meta.url,
  ),
  "utf8",
);

test("only an unresolved current-day recurring Event exposes occurrence skipping", () => {
  assert.match(
    workspace,
    /commitment\.commitment_type === "event" && commitment\.recurrence !== "none"/,
  );
  assert.match(
    workspace,
    /commitment\.occurrence_date === today/,
  );
  assert.match(workspace, />\s*Skip today\s*</);
});

test("skipping uses the existing audited occurrence correction path", () => {
  assert.match(
    actions,
    /skipCalendarEventOccurrenceAction[\s\S]*correctCalendarEventOccurrenceOutcome\(\{[\s\S]*outcome: "cancelled"[\s\S]*completedTime: null[\s\S]*note: null/,
  );
  assert.match(
    service,
    /correct_calendar_event_occurrence_outcome/,
  );
  assert.match(
    correctionMigration,
    /where id = v_occurrence\.id/i,
  );
  assert.doesNotMatch(
    correctionMigration,
    /update public\.calendar_commitments/i,
  );
});

test("the selected local date is submitted and future occurrences remain untouched", () => {
  assert.match(
    workspace,
    /name="occurrenceDate"[\s\S]*value=\{commitment\.occurrence_date\}/,
  );
  assert.match(
    correctionMigration,
    /occurrence_date = p_occurrence_date[\s\S]*for update/i,
  );
  assert.doesNotMatch(correctionMigration, /delete from public\.calendar_commitment_occurrences/i);
});

test("recurring series operations stay explicitly secondary", () => {
  assert.match(workspace, />\s*Edit\s*</);
  assert.match(workspace, />\s*Change repeat\s*</);
  assert.match(workspace, />\s*Stop repeating\s*</);
  assert.doesNotMatch(workspace, /Cancel recurring series/);
  assert.match(
    workspace,
    /Only this dated occurrence is skipped\. Future occurrences continue\./,
  );
});

test("the correction RPC preserves authenticated ownership and future-date rejection", () => {
  assert.match(correctionMigration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(
    correctionMigration,
    /from public\.calendar_commitments[\s\S]*id = p_calendar_commitment_id[\s\S]*user_id = v_user_id[\s\S]*for update/i,
  );
  assert.match(
    correctionMigration,
    /p_occurrence_date > \(v_now at time zone v_timezone\)::date[\s\S]*future Calendar occurrence cannot be corrected/i,
  );
});
