import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260825000004_allow_current_day_occurrence_correction.sql",
    import.meta.url,
  ),
  "utf8",
);
const agendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const outcomeControlSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-occurrence-outcome-control.tsx",
    import.meta.url,
  ),
  "utf8",
);
const editorSource = readFileSync(
  new URL(
    "../../components/clarity/historical-outcome-correction-editor.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dailyCommitmentsSource = readFileSync(
  new URL("../../components/clarity/daily-commitments.tsx", import.meta.url),
  "utf8",
);
const occurrenceWorkspaceSource = readFileSync(
  new URL("../../components/clarity/calendar-occurrence-workspace.tsx", import.meta.url),
  "utf8",
);

test("the correction RPC accepts past and profile-local today but rejects future dates", () => {
  assert.match(
    migration,
    /select timezone into v_timezone[\s\S]*from public\.profiles where id = v_user_id/i,
  );
  assert.match(
    migration,
    /p_occurrence_date > \(v_now at time zone v_timezone\)::date/i,
  );
  assert.doesNotMatch(
    migration,
    /p_occurrence_date >= \(v_now at time zone v_timezone\)::date/i,
  );
  assert.match(migration, /future Calendar occurrence cannot be corrected/i);
});

test("the correction remains authenticated, ownership-safe, locked, and occurrence-specific", () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /if v_user_id is null[\s\S]*Authentication required/i);
  assert.match(
    migration,
    /from public\.calendar_commitments[\s\S]*id = p_calendar_commitment_id and user_id = v_user_id[\s\S]*for update/i,
  );
  assert.match(
    migration,
    /from public\.calendar_commitment_occurrences[\s\S]*calendar_commitment_id = v_commitment\.id[\s\S]*user_id = v_user_id[\s\S]*occurrence_date = p_occurrence_date[\s\S]*for update/i,
  );
  assert.match(migration, /private\.calendar_commitment_occurs_on_date/i);
});

test("Completed, Missed, and Cancelled corrections update one occurrence and retain audit history", () => {
  assert.match(
    outcomeControlSource,
    /\["attended", "Completed"\][\s\S]*\["missed", "Missed"\][\s\S]*\["cancelled", "Cancelled"\]/,
  );
  assert.match(migration, /p_new_outcome public\.calendar_event_outcome/i);
  assert.match(migration, /p_new_outcome = 'rescheduled'[\s\S]*raise exception/i);
  const revisionAt = migration.indexOf(
    "insert into public.calendar_commitment_occurrence_revisions",
  );
  const updateAt = migration.indexOf(
    "update public.calendar_commitment_occurrences",
  );
  assert.ok(revisionAt >= 0 && updateAt > revisionAt);
  assert.match(migration, /where id = v_occurrence\.id/i);
  assert.doesNotMatch(migration, /update public\.calendar_commitments/i);
  assert.doesNotMatch(migration, /recurrence_(?:unit|interval|weekdays)\s*=/i);
});

test("completion time is preserved by the editor and can be changed or removed", () => {
  assert.match(
    outcomeControlSource,
    /initialOutcome === "attended" && commitment\.completed_at[\s\S]*formatTimestampAsLocalTime\(commitment\.completed_at, timezone\)/,
  );
  assert.match(
    editorSource,
    /existingCompletionTime: initialCompletionTime/,
  );
  assert.match(editorSource, /onRemove=\{\(\) => setCompletionTime\(""\)\}/);
  assert.match(
    editorSource,
    /name="completedTime"[\s\S]*value=\{completed \? completionTime : ""\}/,
  );
  assert.match(
    migration,
    /p_occurrence_date \+ p_completed_time\) at time zone v_timezone/i,
  );
  assert.match(migration, /completed_at = v_completed_at/i);
});

test("current day uses Update status, past uses Correct outcome, and future keeps schedule editing", () => {
  assert.match(
    occurrenceWorkspaceSource,
    /commitment\.commitment_type === "event" &&[\s\S]*commitment\.occurrence_date === today/,
  );
  assert.match(
    outcomeControlSource,
    /currentDay \? "Update status" : "Correct outcome"/,
  );
  assert.match(outcomeControlSource, /useState\(currentDay\)/);
  assert.match(outcomeControlSource, /title=\{currentDay \? "Update status" : "Correct outcome"\}/);
  assert.match(outcomeControlSource, /submitLabel=\{currentDay \? "Save" : "Confirm correction"\}/);
  assert.match(outcomeControlSource, /submittingLabel=\{currentDay \? "Saving…" : "Correcting…"\}/);
  assert.match(
    occurrenceWorkspaceSource,
    /readOnly && commitment\.commitment_type === "event"/,
  );
  assert.match(occurrenceWorkspaceSource, /commitment\.status === "scheduled"[\s\S]*>\s*Edit\s*</);
  assert.doesNotMatch(outcomeControlSource, /\["not_recorded", "Not recorded"\]/);
});

test("the shared occurrence editor stays inside the existing card surface", () => {
  assert.match(
    editorSource,
    /data-slot="historical-outcome-correction-editor"[\s\S]*className="space-y-5"/,
  );
  assert.doesNotMatch(
    editorSource,
    /data-slot="historical-outcome-correction-editor"[\s\S]{0,140}border-t/,
  );
  assert.doesNotMatch(
    editorSource,
    /data-slot="historical-outcome-correction-editor"[\s\S]{0,140}rounded-|bg-card/,
  );
});

test("Today opens the current occurrence workspace and retains its Calendar series link", () => {
  assert.match(
    dailyCommitmentsSource,
    /<CalendarOccurrenceWorkspace/,
  );
  assert.match(
    occurrenceWorkspaceSource,
    /<CalendarOccurrenceOutcomeControl[\s\S]*currentDay/,
  );
  assert.match(
    dailyCommitmentsSource,
    /router\.push\([\s\S]*`\/calendar\/commitments\/\$\{commitment\.id\}\?date=\$\{commitment\.occurrence_date\}`/,
  );
  assert.match(
    agendaSource,
    /href=\{`\/calendar\/commitments\/\$\{commitment\.id\}\?date=\$\{commitment\.occurrence_date\}`\}/,
  );
  assert.doesNotMatch(agendaSource, /setOpenId/);
});

test("the migration preserves the authenticated execution boundary and schema reload", () => {
  assert.match(
    migration,
    /grant execute on function public\.correct_calendar_event_occurrence_outcome\([\s\S]*\) to authenticated/i,
  );
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
