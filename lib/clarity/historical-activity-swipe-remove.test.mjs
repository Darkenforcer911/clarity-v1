import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const historySource = readFileSync(
  new URL("../../components/clarity/calendar-history.tsx", import.meta.url),
  "utf8",
);
const swipeSource = readFileSync(
  new URL("../../components/clarity/swipe-to-remove.tsx", import.meta.url),
  "utf8",
);
const agendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const todayCommitmentsSource = readFileSync(
  new URL("../../components/clarity/daily-commitments.tsx", import.meta.url),
  "utf8",
);

test("user-added historical activity uses the shared swipe-to-remove interaction", () => {
  assert.match(historySource, /import \{ SwipeToRemove \} from "\.\/swipe-to-remove"/);
  assert.match(historySource, /<SwipeToRemove[\s\S]*accessibilityContext="from historical activity"/);
  assert.match(historySource, /const \[swipedCorrectionId, setSwipedCorrectionId\]/);
  assert.match(historySource, /open=\{swipeOpen\}/);
  assert.match(historySource, /onOpenChange=\{onSwipeOpenChange\}/);
});

test("swiping only reveals Remove and explicit Remove uses canonical correction deletion", () => {
  const finishGesture = swipeSource.slice(
    swipeSource.indexOf("function finishGesture"),
    swipeSource.indexOf("function handleClickCapture"),
  );
  assert.doesNotMatch(finishGesture, /onRemove/);
  assert.match(swipeSource, /onClick=\{onRemove\}/);
  assert.match(
    historySource,
    /deleteDayCorrectionAction\(\s*initialCalendarActionState,\s*formData,?\s*\)/,
  );
  assert.match(historySource, /formData\.set\("correctionId", correction\.id\)/);
});

test("historical activity keeps expandable editing without a permanent Remove control", () => {
  assert.match(historySource, /data-slot="historical-completed-activity-card"/);
  assert.match(historySource, /aria-expanded=\{expanded\}/);
  assert.match(historySource, /onClick=\{toggleExpanded\}/);
  assert.match(historySource, /\{expanded && \([\s\S]*<Pencil \/> Edit/);
  assert.doesNotMatch(historySource, /<Trash2 \/> Remove/);
  assert.doesNotMatch(historySource, /Remove this added item\?/);
});

test("Calendar-generated history retains correction semantics without destructive swipe removal", () => {
  assert.match(agendaSource, /<HistoricalOutcomeCorrectionEditor/);
  assert.match(agendaSource, /correctCalendarEventOccurrenceOutcomeAction/);
  assert.doesNotMatch(
    agendaSource,
    /accessibilityContext="from historical activity"/,
  );
  assert.match(agendaSource, /const canSwipeRemove =[\s\S]*!readOnly/);
  assert.match(
    todayCommitmentsSource,
    /const removable =[\s\S]*commitment\.status === "scheduled"[\s\S]*!commitment\.reconciliation_outcome/,
  );
});
