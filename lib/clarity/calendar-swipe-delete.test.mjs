import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVE_ACTION_SWIPE_OPEN_THRESHOLD_PX,
  resolveActiveActionSwipeOpen,
} from "./active-today-swipe.ts";

const calendarAgendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const swipeSource = readFileSync(
  new URL("../../components/clarity/swipe-to-remove.tsx", import.meta.url),
  "utf8",
);
const dailyCommitmentsSource = readFileSync(
  new URL("../../components/clarity/daily-commitments.tsx", import.meta.url),
  "utf8",
);
const activeTodaySource = readFileSync(
  new URL("../../components/clarity/active-today.tsx", import.meta.url),
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
  new URL("../../components/clarity/calendar-occurrence-workspace.tsx", import.meta.url),
  "utf8",
);
const commitmentDetailSource = readFileSync(
  new URL("../../components/clarity/calendar-commitment-detail.tsx", import.meta.url),
  "utf8",
);

test("Calendar commitments reveal their concise action only after the shared swipe threshold", () => {
  assert.match(calendarAgendaSource, /<SwipeToRemove/);
  assert.match(
    calendarAgendaSource,
    /actionLabel=\{canSkipThisOccurrence \? "Skip" : "Remove"\}/,
  );
  assert.equal(resolveActiveActionSwipeOpen(0, -10), false);
  assert.equal(
    resolveActiveActionSwipeOpen(0, -ACTIVE_ACTION_SWIPE_OPEN_THRESHOLD_PX),
    true,
  );
});

test("the swipe gesture never invokes deletion by itself", () => {
  const finishGesture = swipeSource.slice(
    swipeSource.indexOf("function finishGesture"),
    swipeSource.indexOf("function handleClickCapture"),
  );
  assert.doesNotMatch(finishGesture, /onRemove/);
  assert.match(swipeSource, /onClick=\{onRemove\}/);
});

test("explicit Calendar removal confirms before using the deletion server action", () => {
  assert.match(calendarAgendaSource, /setDeleteConfirming\(true\)/);
  assert.match(deleteControlSource, /Remove \{commitment\.title\}\?/);
  assert.match(deleteControlSource, /This will remove it from your calendar\./);
  assert.match(
    deleteControlSource,
    /deleteCalendarCommitmentAction[\s\S]*initialCalendarActionState/,
  );
  assert.match(deleteControlSource, /name="commitmentId" value=\{commitment\.id\}/);
});

test("expanded cards keep date skipping separate from confirmed one-off removal", () => {
  assert.match(occurrenceWorkspaceSource, /Stop repeating/);
  assert.match(calendarAgendaSource, /CalendarCommitmentDeleteControl/);
  assert.match(deleteControlSource, /triggerLabel \?\? "Remove"/);
});

test("current and future commitments expose the canonical prefilled edit form", () => {
  assert.match(
    occurrenceWorkspaceSource,
    /commitment\.status === "scheduled"[\s\S]*>\s*Edit\s*</,
  );
  assert.match(
    commitmentDetailSource,
    /<CalendarCommitmentForm[\s\S]*commitment=\{commitment\}/,
  );

  const formSource = readFileSync(
    new URL("../../components/clarity/calendar-commitment-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    formSource,
    /commitment\?\.commitment_type \?\? initialType \?\? "event"/,
  );
  assert.match(formSource, /commitment\?\.title \?\? ""/);
  assert.match(formSource, /commitment\?\.local_date \?\? selectedDate/);
  assert.match(formSource, /commitment\?\.event_start_time\?\.slice\(0, 5\) \?\? ""/);
  assert.match(formSource, /commitment\?\.deadline_due_time\?\.slice\(0, 5\) \?\? ""/);
  assert.match(
    formSource,
    /commitment \? commitment\.duration_minutes \?\? 0 : 30/,
  );
  assert.match(formSource, /getCalendarCommitmentRecurrenceRule\(commitment\)/);
  assert.match(
    formSource,
    /unit: null, interval: 1, weekdays: \[\]/,
  );
  assert.match(formSource, /commitment\?\.details \?\? ""/);
});

test("Calendar commitments shown on Today use domain-safe swipe removal", () => {
  assert.match(dailyCommitmentsSource, /<SwipeToRemove/);
  assert.match(
    dailyCommitmentsSource,
    /recurringEvent[\s\S]*skipToday/,
  );
  assert.match(
    dailyCommitmentsSource,
    /actionLabel=\{recurringEvent \? "Skip" : "Remove"\}/,
  );
  assert.match(dailyCommitmentsSource, /router\.push\([\s\S]*`\/calendar\/commitments\//);
});

test("a Calendar recurring Event swipe skips today instead of deleting its series", () => {
  assert.match(
    calendarAgendaSource,
    /const canSwipeRemove =[\s\S]*\(!recurringEvent \|\| canSkipThisOccurrence\)/,
  );
  assert.match(
    calendarAgendaSource,
    /if \(!canSkipThisOccurrence\)[\s\S]*setDeleteConfirming\(true\)[\s\S]*const result = await skipCalendarEventOccurrenceAction/,
  );
  assert.match(
    calendarAgendaSource,
    /formData\.set\("occurrenceDate", commitment\.occurrence_date\)/,
  );
  assert.match(calendarAgendaSource, /enabled=\{canSwipeRemove\}/);
});

test("normal Today actions retain their existing remove swipe", () => {
  assert.match(activeTodaySource, /<SwipeToRemove/);
  assert.match(activeTodaySource, /accessibilityContext="from today"/);
  assert.doesNotMatch(activeTodaySource, /actionLabel="Delete"/);
});

test("shared swipe preserves vertical scrolling and Calendar rows navigate normally", () => {
  assert.match(swipeSource, /\[touch-action:pan-y\]/);
  assert.match(calendarAgendaSource, /<Link[\s\S]*\/calendar\/commitments\//);
  assert.doesNotMatch(calendarAgendaSource, /<CalendarOccurrenceWorkspace/);
});

test("ordinary taps are not pointer-captured before a horizontal swipe exists", () => {
  const pointerDown = swipeSource.slice(
    swipeSource.indexOf("function handlePointerDown"),
    swipeSource.indexOf("function handlePointerMove"),
  );
  const pointerMove = swipeSource.slice(
    swipeSource.indexOf("function handlePointerMove"),
    swipeSource.indexOf("function finishGesture"),
  );

  assert.doesNotMatch(pointerDown, /setPointerCapture/);
  assert.match(
    pointerMove,
    /gesture\.intent !== "horizontal"[\s\S]*setPointerCapture\(event\.pointerId\)/,
  );
});

test("vertical intent never captures the pointer or translates the row", () => {
  const pointerMove = swipeSource.slice(
    swipeSource.indexOf("function handlePointerMove"),
    swipeSource.indexOf("function finishGesture"),
  );
  const verticalBranch = pointerMove.slice(
    pointerMove.indexOf('gesture.intent === "vertical"'),
    pointerMove.indexOf('gesture.intent !== "horizontal"'),
  );

  assert.match(verticalBranch, /moveCard\(0\)/);
  assert.match(verticalBranch, /onOpenChange\(false\)/);
  assert.doesNotMatch(verticalBranch, /preventDefault|setPointerCapture/);
});

test("a gesture that turns vertical cancels a partially started swipe", () => {
  const pointerMove = swipeSource.slice(
    swipeSource.indexOf("function handlePointerMove"),
    swipeSource.indexOf("function finishGesture"),
  );

  assert.match(
    pointerMove,
    /gesture\.intent === "horizontal"[\s\S]*resolveActiveActionSwipeIntent\(deltaX, deltaY, false\) === "vertical"[\s\S]*gesture\.intent = "vertical"/,
  );
  assert.match(pointerMove, /releasePointerCapture\(event\.pointerId\)/);
});

test("the destructive background is clipped and isolated to its own row", () => {
  assert.match(
    swipeSource,
    /className="relative isolate min-w-0 overflow-hidden rounded-2xl \[touch-action:pan-y\]"/,
  );
});

test("pointer cancellation restores a valid resting offset", () => {
  assert.match(swipeSource, /function cancelGesture/);
  assert.match(
    swipeSource,
    /closeForVerticalScroll[\s\S]*currentOffsetRef\.current = closeForVerticalScroll[\s\S]*setDragOffset\(closeForVerticalScroll \? 0 : null\)/,
  );
  assert.match(swipeSource, /onPointerCancel=\{cancelGesture\}/);
});
