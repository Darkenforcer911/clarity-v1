import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../../supabase/migrations/20260904000004_delete_one_off_calendar_commitment_history.sql",
    import.meta.url,
  ),
  "utf8",
);
const calendarActionsSource = readFileSync(
  new URL("../../app/(app)/calendar/actions.ts", import.meta.url),
  "utf8",
);
const calendarAgendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const deleteControlSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-commitment-delete-control.tsx",
    import.meta.url,
  ),
  "utf8",
);
const occurrenceWorkspaceSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-occurrence-workspace.tsx",
    import.meta.url,
  ),
  "utf8",
);

function deleteFunction() {
  return migrationSource.slice(
    migrationSource.indexOf(
      "create or replace function public.delete_calendar_commitment",
    ),
    migrationSource.indexOf("revoke all on function"),
  );
}

test("one-off deletion removes revisions, occurrence, and commitment in dependency order", () => {
  const source = deleteFunction();
  const deleteRevision = source.indexOf(
    "delete from public.calendar_commitment_occurrence_revisions",
  );
  const deleteOccurrence = source.indexOf(
    "delete from public.calendar_commitment_occurrences",
  );
  const deleteCommitment = source.indexOf(
    "delete from public.calendar_commitments",
  );

  assert.ok(deleteRevision >= 0);
  assert.ok(deleteOccurrence > deleteRevision);
  assert.ok(deleteCommitment > deleteOccurrence);
  assert.match(
    source,
    /revision\.calendar_commitment_occurrence_id = occurrence\.id[\s\S]*revision\.user_id = occurrence\.user_id/,
  );
});

test("one-off deletion is authenticated, ownership scoped, locked, and authenticated-only", () => {
  const source = deleteFunction();
  assert.match(source, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(source, /if v_user_id is null/);
  assert.match(
    source,
    /commitment\.id = p_calendar_commitment_id[\s\S]*commitment\.user_id = v_user_id[\s\S]*for update/,
  );
  assert.match(source, /for update of revision/);
  assert.match(
    migrationSource,
    /revoke all on function public\.delete_calendar_commitment\(uuid\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.delete_calendar_commitment\(uuid\)[\s\S]*to authenticated/,
  );
});

test("hard deletion rejects recurring series and preserves separate skip/cancel UI", () => {
  const source = deleteFunction();
  assert.match(source, /v_commitment\.recurrence <> 'none'/);
  assert.match(calendarAgendaSource, /skipCalendarEventOccurrenceAction/);
  assert.match(occurrenceWorkspaceSource, /Stop repeating/);
  assert.doesNotMatch(source, /set status = 'cancelled'/i);
});

test("deletion does not silently erase linked Actions or canonical Life evidence", () => {
  const source = deleteFunction();
  assert.match(source, /action\.source_calendar_commitment_id = v_commitment\.id/);
  assert.match(source, /evidence\.source_calendar_occurrence_id/);
  assert.doesNotMatch(source, /delete from public\.daily_actions/i);
  assert.doesNotMatch(source, /delete from public\.life_evidence/i);
});

test("completed and unresolved one-off records use the same deletion path", () => {
  const source = deleteFunction();
  assert.doesNotMatch(source, /v_commitment\.status\s*(=|<>|in)/i);
  assert.match(occurrenceWorkspaceSource, /commitment\.recurrence === "none"/);
});

test("the user confirms destructive deletion with product language", () => {
  assert.match(deleteControlSource, /Remove \{commitment\.title\}\?/);
  assert.match(deleteControlSource, /This will remove it from your calendar\./);
  assert.match(deleteControlSource, /deleteCalendarCommitmentAction/);
});

test("database errors are logged server-side and replaced with a safe message", () => {
  const deletionAction = calendarActionsSource.slice(
    calendarActionsSource.indexOf(
      "export async function deleteCalendarCommitmentAction",
    ),
    calendarActionsSource.indexOf(
      "export async function undoCalendarEventCompletionAction",
    ),
  );
  assert.match(
    deletionAction,
    /console\.error\("Failed to delete Calendar commitment", \{[\s\S]*commitmentId,[\s\S]*error/,
  );
  assert.match(deletionAction, /Couldn’t remove this event\. Try again\./);
  assert.doesNotMatch(deletionAction, /error instanceof Error \? error\.message/);
});

test("successful deletion revalidates Calendar and every Today plan surface", () => {
  assert.match(
    calendarActionsSource,
    /function revalidateCalendar\(\)[\s\S]*revalidatePath\("\/calendar"\)[\s\S]*revalidatePath\("\/today"\)[\s\S]*revalidatePath\("\/today\/plan"\)[\s\S]*revalidatePath\("\/today\/active"\)/,
  );
});
