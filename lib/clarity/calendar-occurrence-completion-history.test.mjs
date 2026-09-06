import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatCalendarOutcomeLabel,
  formatCalendarOutcomeStatus,
} from "./calendar-occurrence-presentation.ts";
import { formatCommitmentTime } from "./calendar-rules.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260819000001_calendar_occurrence_completion_history.sql",
    import.meta.url,
  ),
  "utf8",
);
const agendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const dailyCommitmentsSource = readFileSync(
  new URL("../../components/clarity/daily-commitments.tsx", import.meta.url),
  "utf8",
);
const outcomeControlSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-occurrence-outcome-control.tsx",
    import.meta.url,
  ),
  "utf8",
);
const serviceSource = readFileSync(
  new URL("./calendar-service.ts", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../../app/(app)/calendar/actions.ts", import.meta.url),
  "utf8",
);
const lifeModelMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260818000001_life_model_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

const commitment = {
  id: "00000000-0000-4000-8000-000000000001",
  user_id: "00000000-0000-4000-8000-000000000002",
  commitment_type: "event",
  title: "Accutane",
  local_date: "2026-08-18",
  event_start_time: "21:00:00",
  deadline_due_time: null,
  duration_minutes: null,
  recurrence: "daily",
  details: null,
  status: "completed",
  timezone: "Australia/Melbourne",
  reminder_offsets_minutes: [],
  rescheduled_from_id: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-18T11:14:00Z",
  occurrence_date: "2026-08-18",
  occurrence_id: "00000000-0000-4000-8000-000000000003",
  reconciliation_outcome: "attended",
  outcome_note: null,
  outcome_recorded_at: "2026-08-18T11:14:00Z",
  replacement_commitment_id: null,
  can_undo_completion: true,
};

test("attended is presented as Completed across Calendar outcome controls", () => {
  assert.equal(formatCalendarOutcomeLabel("attended"), "Completed");
  assert.doesNotMatch(agendaSource, />Attended</);
  assert.match(outcomeControlSource, /\["attended", "Completed"\]/);
  assert.match(
    dailyCommitmentsSource,
    /commitment\.reconciliation_outcome[\s\S]*formatCalendarOutcomeStatus\(commitment, timezone\)/,
  );
  assert.doesNotMatch(dailyCommitmentsSource, /"Attended"/);
});

test("legacy completion does not fabricate a completion time", () => {
  assert.equal(
    formatCalendarOutcomeStatus({ ...commitment, completed_at: null }, "Australia/Melbourne"),
    "Completed",
  );
  assert.doesNotMatch(migration, /update public\.calendar_commitment_occurrences[\s\S]*set completed_at/i);
});

test("new completion time is shown in profile-local time separately from schedule", () => {
  const completed = {
    ...commitment,
    completed_at: "2026-08-18T11:14:00Z",
  };
  assert.equal(formatCommitmentTime(completed.event_start_time), "9:00 pm");
  assert.equal(
    formatCalendarOutcomeStatus(completed, "Australia/Melbourne"),
    "Completed · 9:14 pm",
  );
  assert.match(migration, /if p_outcome = 'attended' then\s+v_completed_at := v_now/i);
  assert.match(migration, /'completed_at', occurrence\.completed_at/i);
});

test("Calendar exposes general occurrence-level Correct outcome", () => {
  assert.match(
    outcomeControlSource,
    /currentDay \? "Update status" : "Correct outcome"/,
  );
  assert.match(outcomeControlSource, /\["attended", "Completed"\]/);
  assert.match(outcomeControlSource, /\["missed", "Missed"\]/);
  assert.match(outcomeControlSource, /\["cancelled", "Cancelled"\]/);
  assert.doesNotMatch(outcomeControlSource, /\["not_recorded", "Not recorded"\]/);
  assert.match(outcomeControlSource, /correctCalendarEventOccurrenceOutcomeAction/);
  assert.doesNotMatch(agendaSource, />\s*Undo completion\s*</);
});

test("undo appends history before changing the stable occurrence row", () => {
  const undoFunction = migration.slice(
    migration.indexOf("create function public.undo_calendar_event_completion"),
    migration.indexOf("create or replace function public.get_calendar_commitments_for_date"),
  );
  const revisionInsert = undoFunction.indexOf(
    "insert into public.calendar_commitment_occurrence_revisions",
  );
  const effectiveUpdate = undoFunction.indexOf(
    "update public.calendar_commitment_occurrences",
  );
  assert.ok(revisionInsert >= 0);
  assert.ok(effectiveUpdate > revisionInsert);
  assert.match(undoFunction, /previous_outcome[\s\S]*v_occurrence\.outcome/i);
  assert.match(undoFunction, /previous_completed_at[\s\S]*v_occurrence\.completed_at/i);
  assert.match(undoFunction, /set\s+outcome = null[\s\S]*completed_at = null/i);
  assert.doesNotMatch(undoFunction, /delete from public\.calendar_commitment_occurrences/i);
});

test("undo is ownership checked, row locked, occurrence-specific, and retry safe", () => {
  const undoFunction = migration.slice(
    migration.indexOf("create function public.undo_calendar_event_completion"),
    migration.indexOf("create or replace function public.get_calendar_commitments_for_date"),
  );
  assert.match(undoFunction, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(undoFunction, /calendar_commitments[\s\S]*user_id = v_user_id[\s\S]*for update/i);
  assert.match(
    undoFunction,
    /calendar_commitment_id = v_commitment\.id[\s\S]*user_id = v_user_id[\s\S]*occurrence_date = p_occurrence_date[\s\S]*for update/i,
  );
  assert.match(undoFunction, /outcome is distinct from 'attended'/i);
  assert.doesNotMatch(undoFunction, /update public\.calendar_commitments/i);
});

test("recurring parent and adjacent occurrences remain unchanged", () => {
  const undoFunction = migration.slice(
    migration.indexOf("create function public.undo_calendar_event_completion"),
    migration.indexOf("create or replace function public.get_calendar_commitments_for_date"),
  );
  assert.match(undoFunction, /occurrence_date = p_occurrence_date/i);
  assert.match(undoFunction, /where id = v_occurrence\.id/i);
  assert.doesNotMatch(undoFunction, /recurrence\s*=/i);
  assert.doesNotMatch(undoFunction, /occurrence_date\s*[<>]/i);
});

test("Life Model Evidence retains its stable occurrence foreign key", () => {
  assert.match(
    lifeModelMigration,
    /foreign key \(source_calendar_occurrence_id, user_id\)[\s\S]*references public\.calendar_commitment_occurrences\(id, user_id\)/i,
  );
  assert.doesNotMatch(migration, /drop constraint life_evidence_calendar_source_owner_fkey/i);
  assert.doesNotMatch(migration, /delete from public\.life_evidence/i);
});

test("server action reuses the authenticated Calendar service boundary", () => {
  assert.match(serviceSource, /correct_calendar_event_occurrence_outcome/);
  assert.match(serviceSource, /getAuthenticatedUserAndProfile\(\)/);
  assert.match(actionSource, /export async function correctCalendarEventOccurrenceOutcomeAction/);
  assert.match(actionSource, /revalidateCalendar\(\)/);
});
