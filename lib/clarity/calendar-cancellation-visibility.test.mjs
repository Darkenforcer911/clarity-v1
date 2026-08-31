import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  filterActiveCalendarCommitments,
  filterTodayCalendarCommitments,
  isActiveCalendarCommitment,
} from "./calendar-commitment-visibility.ts";

const calendarServiceSource = readFileSync(
  new URL("./calendar-service.ts", import.meta.url),
  "utf8",
);
const dailyLoopSource = readFileSync(
  new URL("./daily-loop-queries.ts", import.meta.url),
  "utf8",
);
const calendarAgendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const calendarActionsSource = readFileSync(
  new URL("../../app/(app)/calendar/actions.ts", import.meta.url),
  "utf8",
);
const calendarMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260805000001_calendar_commitments.sql",
    import.meta.url,
  ),
  "utf8",
);
const reconciliationMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260807000001_proposed_plan_reconciliation.sql",
    import.meta.url,
  ),
  "utf8",
);
const notificationMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260816000002_notification_delivery_dispatch.sql",
    import.meta.url,
  ),
  "utf8",
);

test("scheduled commitments remain visible in active Calendar", () => {
  assert.equal(isActiveCalendarCommitment({ status: "scheduled" }), true);
  assert.equal(isActiveCalendarCommitment({ status: "completed" }), true);
  assert.equal(isActiveCalendarCommitment({ status: "missed" }), true);
});

test("cancelled commitments are removed from active agenda collections", () => {
  const commitments = [
    { id: "scheduled", status: "scheduled" },
    { id: "cancelled", status: "cancelled" },
  ];
  assert.deepEqual(
    filterActiveCalendarCommitments(commitments).map((item) => item.id),
    ["scheduled"],
  );
});

test("an occurrence-level cancellation remains visible for correction", () => {
  const commitments = [
    {
      id: "cancelled-occurrence",
      status: "cancelled",
      reconciliation_outcome: "cancelled",
    },
    { id: "cancelled-series", status: "cancelled" },
  ];
  assert.deepEqual(
    filterActiveCalendarCommitments(commitments).map((item) => item.id),
    ["cancelled-occurrence"],
  );
});

test("Today excludes both series cancellations and skipped occurrences", () => {
  const commitments = [
    { id: "scheduled", status: "scheduled", reconciliation_outcome: null },
    {
      id: "skipped-occurrence",
      status: "cancelled",
      reconciliation_outcome: "cancelled",
    },
    { id: "cancelled-series", status: "cancelled" },
  ];

  assert.deepEqual(
    filterTodayCalendarCommitments(commitments).map((item) => item.id),
    ["scheduled"],
  );
});

test("Calendar filters cancellation only for current and future presentation", () => {
  assert.match(
    calendarServiceSource,
    /commitments: isPast[\s\S]*\? commitments[\s\S]*: filterActiveCalendarCommitments\(commitments\)/,
  );
  assert.match(calendarServiceSource, /getCalendarCommitmentsForDate/);
});

test("Today excludes cancelled commitments before fixed-reality presentation", () => {
  assert.match(
    dailyLoopSource,
    /commitments: filterTodayCalendarCommitments\([\s\S]*parseCalendarCommitments\(commitmentsResult\.data\)/,
  );
});

test("Calendar mutations invalidate the Today gateway and active presentation", () => {
  assert.match(
    calendarActionsSource,
    /function revalidateCalendar\(\)[\s\S]*revalidatePath\("\/today"\)[\s\S]*revalidatePath\("\/today\/active"\)/,
  );
});

test("cancellation preserves its row and historical status", () => {
  const cancelFunction = calendarMigration.slice(
    calendarMigration.indexOf("create function public.cancel_calendar_commitment"),
    calendarMigration.indexOf("create function public.delete_calendar_commitment"),
  );
  assert.match(cancelFunction, /set status = 'cancelled'/i);
  assert.doesNotMatch(cancelFunction, /delete from public\.calendar_commitments/i);
  assert.match(calendarAgendaSource, /readOnly=\{isPast\}/);
  assert.match(calendarAgendaSource, /formatTimingState\(timingState\)/);
});

test("cancelled commitments cannot receive future notification delivery", () => {
  assert.match(notificationMigration, /where commitment\.status = 'scheduled'/i);
  assert.match(notificationMigration, /v_commitment\.status = 'scheduled'/i);
  assert.match(notificationMigration, /status = 'cancelled'[\s\S]*stale_or_ineligible/i);
});

test("Delete remains a separate hard-delete operation", () => {
  const deleteFunction = calendarMigration.slice(
    calendarMigration.indexOf("create function public.delete_calendar_commitment"),
    calendarMigration.indexOf("revoke all on function"),
  );
  assert.match(deleteFunction, /delete from public\.calendar_commitments/i);
  assert.match(calendarAgendaSource, /actionLabel="Delete"/);
});

test("existing recurring and occurrence cancellation semantics remain intact", () => {
  assert.match(calendarMigration, /commitment\.recurrence = 'daily'/i);
  assert.match(calendarMigration, /commitment\.recurrence = 'weekly'/i);
  assert.match(
    reconciliationMigration,
    /when 'cancelled' then 'cancelled'/i,
  );
  assert.match(
    reconciliationMigration,
    /calendar_commitment_occurrences[\s\S]*occurrence_date = p_local_date/i,
  );
});
