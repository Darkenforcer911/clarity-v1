import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { partitionCalendarDailyActions } from "./calendar-daily-actions.ts";
import { resolveShapeTodaySwipeItem } from "./shape-today-swipe.ts";
import { orderLaterTodayItems } from "./today-display-order.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const agendaSource = read("../../components/clarity/calendar-agenda.tsx");
const actionRowsSource = read(
  "../../components/clarity/calendar-daily-actions.tsx",
);
const commitmentFormSource = read(
  "../../components/clarity/calendar-commitment-form.tsx",
);
const calendarActionsSource = read("../../app/(app)/calendar/actions.ts");
const calendarPageSource = read("../../app/(app)/calendar/page.tsx");

function action(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Action",
    action_type: "flexible",
    status: "proposed",
    estimated_minutes: 30,
    scheduled_time: null,
    completed_at: null,
    completion_evidence_only: false,
    actual_minutes: null,
    details: null,
    rescheduled_for: null,
    resolution_note: null,
    sort_order: 0,
    approved_at: null,
    source_routine_id: null,
    daily_plan_id: null,
    local_date: "2026-09-06",
    due_local_date: null,
    due_local_time: null,
    reminder_offsets_minutes: [],
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    commitment_type: "event",
    occurrence_date: "2026-09-06",
    event_start_time: "09:00:00",
    deadline_due_time: null,
    ...overrides,
  };
}

test("Calendar groups day items by time behavior rather than storage type", () => {
  const timedAction = action({
    scheduled_time: "2026-09-06T08:30:00.000Z",
  });
  const routineOccurrence = action({
    id: "33333333-3333-4333-8333-333333333333",
    scheduled_time: "2026-09-06T10:30:00.000Z",
    source_routine_id: "44444444-4444-4444-8444-444444444444",
  });
  const anytimeAction = action({
    id: "55555555-5555-4555-8555-555555555555",
  });
  const dueProjection = action({
    id: timedAction.id,
    calendar_projection: "due",
    due_local_date: "2026-09-06",
  });

  assert.deepEqual(
    partitionCalendarDailyActions([
      timedAction,
      routineOccurrence,
      anytimeAction,
      dueProjection,
    ]),
    {
      timed: [timedAction, routineOccurrence],
      untimed: [anytimeAction],
      due: [dueProjection],
    },
  );

  const schedule = orderLaterTodayItems({
    actions: [routineOccurrence, timedAction],
    commitments: [event()],
    timezone: "UTC",
  });
  assert.deepEqual(
    schedule.map(({ kind, value }) => `${kind}:${value.id}`),
    [
      `action:${timedAction.id}`,
      `commitment:${event().id}`,
      `action:${routineOccurrence.id}`,
    ],
  );

  assert.match(agendaSource, /title="Schedule"/);
  assert.match(agendaSource, /title="Anytime"/);
  assert.match(agendaSource, /title="Due"/);
  assert.doesNotMatch(agendaSource, /title="Scheduled actions"/);
  assert.doesNotMatch(agendaSource, /title="Events"/);
  assert.doesNotMatch(agendaSource, /title="Deadlines"/);
});

test("Action occurrence and Due projections retain one canonical Action identity", () => {
  assert.match(
    actionRowsSource,
    /href=\{`\/today\/actions\/\$\{action\.id\}\?from=calendar&date=\$\{localDate\}`\}/,
  );
  assert.match(
    agendaSource,
    /`action:\$\{action\.id\}:\$\{action\.calendar_projection \?\? "occurrence"\}`/,
  );
  assert.doesNotMatch(
    agendaSource,
    /createCalendarCommitmentAction|insert\([\s\S]*daily_actions/,
  );
});

test("Calendar owns one namespaced, stale-safe swipe reveal across item kinds", () => {
  let openItem = resolveShapeTodaySwipeItem(null, "action:a:occurrence", true);
  assert.equal(openItem, "action:a:occurrence");
  openItem = resolveShapeTodaySwipeItem(
    openItem,
    "commitment:b:2026-09-06",
    true,
  );
  assert.equal(openItem, "commitment:b:2026-09-06");
  openItem = resolveShapeTodaySwipeItem(
    openItem,
    "action:a:occurrence",
    false,
  );
  assert.equal(openItem, "commitment:b:2026-09-06");

  assert.match(
    agendaSource,
    /const \[openSwipeItemKey, setOpenSwipeItemKey\] = useState<string \| null>\(null\)/,
  );
  assert.match(agendaSource, /`commitment:\$\{commitment\.id\}:\$\{commitment\.occurrence_date\}`/);
  assert.match(agendaSource, /resolveShapeTodaySwipeItem\(currentItemKey, itemKey, open\)/);
  assert.match(agendaSource, /document\.addEventListener\("pointerdown", closeOnOutsidePress\)/);
  assert.match(agendaSource, /onOpenWorkspace=\{onOpenAction\}/);
  assert.match(agendaSource, /onClick=\{\(\) => setOpenSwipeItemKey\(null\)\}/);
  assert.match(calendarPageSource, /key=\{data\.selectedDate\}/);
});

test("Calendar occurrence swipe labels preserve occurrence-only semantics", () => {
  assert.match(
    actionRowsSource,
    /action\.source_routine_id \? "Skip today" : "Remove today"/,
  );
  assert.match(
    agendaSource,
    /actionLabel=\{canSkipThisOccurrence \? "Skip today" : "Delete"\}/,
  );
  assert.match(
    agendaSource,
    /skipCalendarEventOccurrenceAction[\s\S]*formData\.set\("occurrenceDate", commitment\.occurrence_date\)/,
  );
  assert.match(calendarActionsSource, /revalidatePath\("\/calendar"\)/);
  assert.match(calendarActionsSource, /revalidatePath\("\/today"\)/);
  assert.match(calendarActionsSource, /revalidatePath\("\/today\/active"\)/);
});

test("primary Add opens the selected-date universal Action form directly", () => {
  assert.match(
    agendaSource,
    /setAddOpen\(true\);[\s\S]*setAddKind\("action"\);/,
  );
  assert.match(
    agendaSource,
    /<AddActionForm[\s\S]*localDate=\{selectedDate\}[\s\S]*destination="calendar"/,
  );
  assert.doesNotMatch(agendaSource, /What are you adding\?/);
});

test("Event and standalone Deadline creation remain quiet secondary paths", () => {
  assert.match(agendaSource, />\s*More\s*</);
  assert.match(agendaSource, />\s*Add event\s*</);
  assert.match(agendaSource, />\s*Add standalone deadline\s*</);
  assert.match(
    agendaSource,
    /initialType=\{addKind\}/,
  );
  assert.match(
    commitmentFormSource,
    /commitment\?\.commitment_type \?\? initialType \?\? "event"/,
  );
  assert.match(
    commitmentFormSource,
    /useState\(!commitment && !initialType\)/,
  );
});
