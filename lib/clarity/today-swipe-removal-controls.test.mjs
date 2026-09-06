import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proposedCardSource = readFileSync(
  new URL("../../components/clarity/proposed-action-card.tsx", import.meta.url),
  "utf8",
);
const proposedPlanSource = readFileSync(
  new URL("../../components/clarity/proposed-plan.tsx", import.meta.url),
  "utf8",
);
const actionWorkspaceSource = readFileSync(
  new URL("../../components/clarity/action-workspace.tsx", import.meta.url),
  "utf8",
);
const activeTodaySource = readFileSync(
  new URL("../../components/clarity/active-today.tsx", import.meta.url),
  "utf8",
);
const actionDetailSource = readFileSync(
  new URL("../../components/clarity/action-detail.tsx", import.meta.url),
  "utf8",
);
const calendarAgendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const calendarDeleteControlSource = readFileSync(
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
const swipeSource = readFileSync(
  new URL("../../components/clarity/swipe-to-remove.tsx", import.meta.url),
  "utf8",
);
const removePanelSource = readFileSync(
  new URL("../../components/clarity/remove-action-panel.tsx", import.meta.url),
  "utf8",
);
const workspaceActionsSource = readFileSync(
  new URL(
    "../../app/(app)/today/action-workspace-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("expanded proposed cards expose the compact universal day-item controls", () => {
  assert.match(proposedCardSource, /Remove from today/);
  assert.match(proposedCardSource, /Skip today/);
  assert.match(proposedCardSource, /<Trash2 \/>/);
  assert.match(proposedCardSource, /onClick=\{\(\) => onRemove\(action\.id\)\}/);
  assert.match(proposedPlanSource, /onRemove=\{removeAction\}/);
  assert.match(proposedCardSource, />\s*Edit\s*</);
  assert.match(
    proposedCardSource,
    /name="completedTime"[\s\S]*value=\{currentTimeInput\}/,
  );
  assert.match(proposedCardSource, />\s*Done\s*</);
  assert.doesNotMatch(proposedCardSource, /Already done|Remove from plan/);
});

test("Proposed Plan retains its existing explicit-tap swipe removal", () => {
  assert.match(proposedPlanSource, /<SwipeToRemove/);
  assert.match(proposedPlanSource, /onRemove=\{\(\) => removeAction\(action\.id\)\}/);
  assert.match(
    proposedPlanSource,
    /accessibilityContext="from the proposed plan"/,
  );
  assert.match(
    proposedPlanSource,
    /removeProposedActionInlineAction\(actionId\)/,
  );
});

test("proposed cards retain reliable accordion taps inside the swipe surface", () => {
  assert.match(
    proposedCardSource,
    /<ProposedActionCompactCard[\s\S]*onToggle=\{\(\) => onToggle\(action\.id\)\}/,
  );
  const compactCardSource = proposedCardSource.slice(
    proposedCardSource.indexOf("function ProposedActionCompactCard"),
  );
  assert.match(compactCardSource, /onClick=\{onToggle\}/);
  assert.match(compactCardSource, /aria-expanded=\{expanded\}/);
  assert.match(
    proposedPlanSource,
    /currentItemKey === actionKey \? null : actionKey/,
  );

  const pointerDown = swipeSource.slice(
    swipeSource.indexOf("function handlePointerDown"),
    swipeSource.indexOf("function handlePointerMove"),
  );
  assert.doesNotMatch(pointerDown, /setPointerCapture/);
});

test("nested proposed-action controls remain independent of the card header", () => {
  const compactCardInvocation = proposedCardSource.indexOf(
    "<ProposedActionCompactCard",
  );
  const expandedEditor = proposedCardSource.indexOf("{!reordering && (");
  const expandedControls = proposedCardSource.slice(expandedEditor);
  assert.ok(compactCardInvocation > -1);
  assert.ok(expandedEditor > compactCardInvocation);
  assert.match(expandedControls, />\s*Edit\s*</);
  assert.match(expandedControls, />\s*Done\s*</);
});

test("active action workspace exposes canonical removal only for active actions", () => {
  assert.match(actionWorkspaceSource, /Remove from today/);
  assert.match(actionWorkspaceSource, /RemoveActionPanel/);
  assert.match(actionWorkspaceSource, /action\.status === "active" \|\| action\.status === "proposed"/);
  assert.match(removePanelSource, /removeActionFromTodayAction/);
  assert.match(
    workspaceActionsSource,
    /removeActionFromTodayAction[\s\S]*actionWorkspaceService\.removeFromToday\(actionId\)/,
  );
  assert.match(
    workspaceActionsSource,
    /removeActionFromTodayInlineAction[\s\S]*actionWorkspaceService\.removeFromToday\(parsedActionId\)/,
  );
  assert.match(actionDetailSource, /readOnly \? \(/);
  assert.match(actionDetailSource, /<HistoricalActionRecord/);
  assert.match(actionWorkspaceSource, />\s*Edit\s*</);
  assert.match(actionWorkspaceSource, /Log update/);
});

test("Active Today retains its existing explicit-tap swipe removal", () => {
  assert.match(activeTodaySource, /<SwipeToRemove/);
  assert.match(activeTodaySource, /onRemove=\{\(\) => onRemove\(action\.id\)\}/);
  assert.match(activeTodaySource, /accessibilityContext="from today"/);
});

test("Calendar commitment removal remains independently domain-aware", () => {
  assert.match(
    calendarAgendaSource,
    /actionLabel=\{canSkipThisOccurrence \? "Skip this occurrence" : "Delete"\}/,
  );
  assert.match(calendarAgendaSource, /CalendarCommitmentDeleteControl/);
  assert.match(calendarDeleteControlSource, /deleteCalendarCommitmentAction/);
  assert.match(calendarAgendaSource, /skipCalendarEventOccurrenceAction/);
  assert.match(occurrenceWorkspaceSource, /Stop repeating/);
});
