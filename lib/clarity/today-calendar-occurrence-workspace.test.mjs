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
    /recurringEvent[\s\S]*"Skip today"[\s\S]*"Remove from today"/,
  );
  assert.match(todayCommitments, />\s*Edit\s*</);
  assert.match(todayCommitments, />\s*More\s*/);
  assert.match(todayCommitments, /data-recurring-day-item-more/);
  assert.doesNotMatch(todayCommitments, />\s*Edit recurring commitment\s*</);
  assert.match(todayCommitments, /Cancel recurring series/);
});

test("Shape Today owns one expanded Action-or-commitment key", () => {
  const proposedPlan = read("../../components/clarity/proposed-plan.tsx");

  assert.match(
    proposedPlan,
    /useState<string \| null>\(null\)[\s\S]*expandedItemKey/,
  );
  assert.match(proposedPlan, /`action:\$\{actionId\}`/);
  assert.match(todayCommitments, /`commitment:\$\{item\.value\.id\}`/);
  assert.match(
    proposedPlan,
    /expandedItemKey=\{expandedItemKey\}[\s\S]*onExpandedItemChange=\{setExpandedItemKey\}/,
  );
});

test("Calendar occurrence Done records the current profile-local time without changing planned time", () => {
  assert.match(
    todayCommitments,
    /name="completedTime"[\s\S]*value=\{getLocalTime\(timezone, now\)\}/,
  );
  assert.doesNotMatch(
    todayCommitments,
    /name="completedTime"[\s\S]{0,120}event_start_time/,
  );
  assert.match(
    correctionMigration,
    /new_completed_at[\s\S]*completed_at = v_completed_at/i,
  );
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
