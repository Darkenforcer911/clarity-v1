import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const shell = read("../../components/clarity/day-item-workspace-shell.tsx");
const actionDetail = read("../../components/clarity/action-detail.tsx");
const actionWorkspace = read("../../components/clarity/action-workspace.tsx");
const actionSeries = read(
  "../../components/clarity/action-repeat-series-controls.tsx",
);
const occurrenceWorkspace = read(
  "../../components/clarity/calendar-occurrence-workspace.tsx",
);
const todayCommitments = read("../../components/clarity/daily-commitments.tsx");
const calendarAgenda = read("../../components/clarity/calendar-agenda.tsx");
const actionService = read("./action-workspace-service.ts");
const materializer = read(
  "../../supabase/migrations/20260904000002_action_occurrence_convergence_v1.sql",
);
const calendarMigration = read(
  "../../supabase/migrations/20260805000001_calendar_commitments.sql",
);

test("Actions and Calendar occurrences use one workspace hierarchy", () => {
  assert.match(shell, /data-day-item-workspace-shell/);
  assert.match(shell, />\s*Ask Clarity\s*</);
  assert.match(actionDetail, /<DayItemWorkspaceShell/);
  assert.match(occurrenceWorkspace, /<DayItemWorkspaceShell/);
  assert.match(todayCommitments, /<CalendarOccurrenceWorkspace/);
  assert.match(calendarAgenda, /<CalendarOccurrenceWorkspace/);
});

test("scheduled and Anytime Actions share one owner-loaded route", () => {
  assert.match(actionDetail, /scheduledTime[\s\S]*Anytime/);
  assert.doesNotMatch(actionDetail, /ScheduledActionWorkspace|AnytimeActionWorkspace/);
  assert.match(actionDetail, /clarityHref={buildActionClarityHref\(action\.id\)}/);
});

test("one-off and repeating Action controls use accurate day-level language", () => {
  assert.match(actionWorkspace, />\s*Edit\s*</);
  assert.match(actionWorkspace, /recurring \? "Skip today" : "Remove from today"/);
  assert.doesNotMatch(actionWorkspace, /Edit action|Remove Action/);
  assert.doesNotMatch(actionWorkspace, /Routine/);
  assert.match(actionWorkspace, /ActionRepeatSeriesControls/);
  assert.match(actionSeries, /Change repeat/);
  assert.match(actionSeries, /Stop repeating/);
});

test("Action series changes are owner-scoped and preserve dated history", () => {
  const seriesMethods = actionService.slice(
    actionService.indexOf("async changeRepeat("),
    actionService.indexOf("async restoreToToday("),
  );
  assert.match(
    actionService,
    /changeRepeat\([\s\S]*getAction\(actionId\)[\s\S]*\.from\("routines"\)[\s\S]*\.eq\("user_id", user\.id\)[\s\S]*\.rpc\("update_routine"/,
  );
  assert.match(
    actionService,
    /stopRepeating\([\s\S]*getAction\(actionId\)[\s\S]*transition_routine_status[\s\S]*p_new_status: "ended"/,
  );
  assert.match(
    materializer,
    /routine\.status = 'active'[\s\S]*not exists[\s\S]*source_routine_id = routine\.id[\s\S]*local_date = p_local_date/,
  );
  assert.doesNotMatch(seriesMethods, /delete/i);
});

test("Calendar occurrence and series controls preserve their existing domains", () => {
  assert.match(occurrenceWorkspace, /correctCalendarEventOccurrenceOutcomeAction/);
  assert.match(occurrenceWorkspace, /skipCalendarEventOccurrenceAction/);
  assert.match(occurrenceWorkspace, /cancelCalendarCommitmentAction/);
  assert.match(occurrenceWorkspace, /Change repeat/);
  assert.match(occurrenceWorkspace, /Stop repeating/);
  assert.doesNotMatch(occurrenceWorkspace, /Edit recurring commitment|Cancel recurring series/);
  assert.match(
    calendarMigration,
    /create function public\.cancel_calendar_commitment[\s\S]*update public\.calendar_commitments[\s\S]*status = 'cancelled'/,
  );
});

test("stopping either repeating domain explicitly preserves history", () => {
  assert.match(
    actionSeries,
    /Future occurrences will no longer be created\. Past activity will[\s\S]*remain in your history\./,
  );
  assert.match(
    occurrenceWorkspace,
    /Future occurrences will no longer be created\. Past activity will[\s\S]*remain in your history\./,
  );
});
