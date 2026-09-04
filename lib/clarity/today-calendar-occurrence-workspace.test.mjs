import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const todayCommitments = read(
  "../../components/clarity/daily-commitments.tsx",
);
const calendarAgenda = read("../../components/clarity/calendar-agenda.tsx");
const outcomeControl = read(
  "../../components/clarity/calendar-occurrence-outcome-control.tsx",
);
const calendarActions = read("../../app/(app)/calendar/actions.ts");
const correctionMigration = read(
  "../../supabase/migrations/20260825000004_allow_current_day_occurrence_correction.sql",
);

test("Today opens a current-day occurrence workspace instead of only navigating to series management", () => {
  assert.match(todayCommitments, /data-today-calendar-occurrence-workspace/);
  assert.match(
    todayCommitments,
    /correctCalendarEventOccurrenceOutcomeAction/,
  );
  assert.match(
    todayCommitments,
    /name="outcome" value="attended"[\s\S]*>\s*Done\s*</,
  );
  assert.match(
    todayCommitments,
    /removalPending \? "Skipping…" : "Skip today"/,
  );
  assert.match(todayCommitments, /Edit recurring commitment/);
  assert.match(todayCommitments, /Cancel recurring series/);
});

test("Done and Skip today share the audited occurrence-only correction boundary", () => {
  assert.match(
    todayCommitments,
    /correctCalendarEventOccurrenceOutcomeAction/,
  );
  assert.match(
    calendarActions,
    /skipCalendarEventOccurrenceAction[\s\S]*correctCalendarEventOccurrenceOutcome\(\{[\s\S]*outcome: "cancelled"/,
  );
  assert.match(
    correctionMigration,
    /where id = v_occurrence\.id/i,
  );
  assert.doesNotMatch(
    correctionMigration,
    /update public\.calendar_commitments/i,
  );
  assert.doesNotMatch(
    correctionMigration,
    /recurrence_(?:unit|interval|weekdays)\s*=/i,
  );
});

test("Today and Calendar use the same current occurrence editor and canonical outcome labels", () => {
  assert.match(todayCommitments, /<CalendarOccurrenceOutcomeControl/);
  assert.match(calendarAgenda, /<CalendarOccurrenceOutcomeControl/);
  assert.match(
    calendarAgenda,
    /!readOnly &&[\s\S]*commitment\.commitment_type === "event" &&[\s\S]*commitment\.occurrence_date === today/,
  );
  assert.match(outcomeControl, /\["attended", "Completed"\]/);
  assert.match(outcomeControl, /\["missed", "Missed"\]/);
  assert.match(outcomeControl, /\["cancelled", "Cancelled"\]/);
});

test("Today keeps legacy recurring records as Calendar commitments", () => {
  assert.match(todayCommitments, /commitment\.commitment_type === "event"/);
  assert.match(
    todayCommitments,
    /commitment\.recurrence !== "none"/,
  );
  assert.doesNotMatch(todayCommitments, /createActionOccurrence|daily_actions/);
});
