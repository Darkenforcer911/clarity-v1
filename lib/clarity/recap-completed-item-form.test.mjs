import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const formSource = readFileSync(
  new URL(
    "../../components/clarity/recap-completed-item-form.tsx",
    import.meta.url,
  ),
  "utf8",
);
const recapSource = readFileSync(
  new URL("../../components/clarity/recap-experience.tsx", import.meta.url),
  "utf8",
);
const noteSource = readFileSync(
  new URL(
    "../../components/clarity/recap-day-context-field.tsx",
    import.meta.url,
  ),
  "utf8",
);
const timeSelectorSource = readFileSync(
  new URL("../../components/clarity/time-selector.tsx", import.meta.url),
  "utf8",
);
const actionPanelSource = readFileSync(
  new URL(
    "../../components/clarity/recap-action-panel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const recapScreenSource = readFileSync(
  new URL("../../components/clarity/recap-screen.tsx", import.meta.url),
  "utf8",
);
const appShellSource = readFileSync(
  new URL("../../components/clarity/app-shell.tsx", import.meta.url),
  "utf8",
);
const transitionSource = readFileSync(
  new URL(
    "../../app/(app)/today/day-transition-actions.ts",
    import.meta.url,
  ),
  "utf8",
);
const previousDaySource = readFileSync(
  new URL(
    "../../components/clarity/previous-day-catch-up.tsx",
    import.meta.url,
  ),
  "utf8",
);
const swipeSource = readFileSync(
  new URL(
    "../../components/clarity/swipe-to-remove.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("Quick Recap uses the focused unplanned-completion copy", () => {
  assert.match(recapSource, /label="Add something completed"/);
  assert.match(
    recapSource,
    /summary="Something you did that wasn't planned"/,
  );
  assert.match(
    formSource,
    /title=\{initialItem \? "Edit completed item" : "Add something completed"\}/,
  );
  assert.match(
    formSource,
    /subtitle="Something you did that wasn't planned"/,
  );
  assert.match(formSource, /<ActionFields/);
  assert.match(formSource, /mode="completed"/);
  assert.doesNotMatch(formSource, /What did you complete\?|When\? \(optional\)/);
});

test("embedded completed-item editor does not repeat its disclosure heading", () => {
  assert.match(formSource, /\{!embedded && \(/);
  assert.match(
    formSource,
    /\{!embedded && \([\s\S]*<ClarityFormHeader[\s\S]*title=\{initialItem \? "Edit completed item" : "Add something completed"\}/,
  );
  assert.match(
    recapSource,
    /<SecondarySettingDisclosure[\s\S]*label="Add something completed"[\s\S]*<RecapCompletedItemForm\s+embedded/,
  );
});

test("historical completion defaults to When and Anytime", () => {
  const actionFieldsSource = readFileSync(
    new URL("../../components/clarity/action-fields.tsx", import.meta.url),
    "utf8",
  );
  assert.match(actionFieldsSource, /label="When"/);
  assert.match(
    actionFieldsSource,
    /mode === "completed"[\s\S]*initialValues\.completedTime \?\? ""/,
  );
  assert.match(timeSelectorSource, /formatCommitmentTime\(value\) \?\? "Anytime"/);
});

test("completion time uses the shared reliable native-time selector", () => {
  assert.match(
    formSource,
    /import \{ ActionFields \} from "\.\/action-fields"/,
  );
  assert.match(
    formSource,
    /<ActionFields[\s\S]*mode="completed"/,
  );
  assert.doesNotMatch(formSource, /<Input\s+[\s\S]*?type="time"/);
});

test("selecting and removing time retains the existing canonical value", () => {
  const actionFieldsSource = readFileSync(
    new URL("../../components/clarity/action-fields.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    actionFieldsSource,
    /scheduledTime=\{whenTime\}[\s\S]*onChange=\{setWhenTime\}/,
  );
  assert.match(
    timeSelectorSource,
    /onRemove=\{[\s\S]*onChange\(""\)[\s\S]*onExpandedChange\(false\)/,
  );
  assert.match(timeSelectorSource, /Remove time/);
});

test("Quick Recap reuses the same native TimeSelector as Action", () => {
  const actionFieldsSource = readFileSync(
    new URL("../../components/clarity/action-fields.tsx", import.meta.url),
    "utf8",
  );
  assert.match(actionFieldsSource, /<OptionalTimeSelector/);
  assert.match(formSource, /<ActionFields/);
  assert.match(timeSelectorSource, /<TimeSelector/);
});

test("planned Done uses the integrated When and Anytime disclosure", () => {
  assert.match(
    actionPanelSource,
    /activeOutcome === "finished"[\s\S]*<TimeSelector[\s\S]*label="When"/,
  );
  assert.match(actionPanelSource, /: "Anytime"/);
  assert.match(actionPanelSource, /<TimeSelector/);
  assert.match(actionPanelSource, /onRemove=\{\(\) => \{/);
  assert.match(timeSelectorSource, /Remove time/);
  assert.match(actionPanelSource, /"Done · Anytime"/);
  assert.doesNotMatch(
    actionPanelSource,
    /Add completion time|Change completion time|<CompletionTimeEditor/,
  );
});

test("planned and unplanned work use the same compact activity card language", () => {
  assert.match(actionPanelSource, /data-slot="recap-activity-card"/);
  assert.match(recapSource, /data-slot="recap-activity-card"/);
  assert.match(
    recapSource,
    /className="overflow-hidden rounded-2xl border border-border bg-card/,
  );
  assert.match(recapSource, /\{`Done · \$\{/);
  assert.match(recapSource, /: "Anytime"/);
  assert.match(recapSource, /<ChevronDown/);
  assert.match(recapSource, /activities\.map\(renderCompletedActivity\)/);
  assert.doesNotMatch(
    recapSource,
    /className="flex min-h-11 items-center gap-3 rounded-xl/,
  );
});

test("Quick Recap draft activity reuses reveal-then-confirm swipe removal", () => {
  assert.match(
    recapSource,
    /import \{ SwipeToRemove \} from "\.\/swipe-to-remove"/,
  );
  assert.match(
    recapSource,
    /<SwipeToRemove[\s\S]*accessibilityContext="from this recap"/,
  );
  assert.match(recapSource, /const \[swipedActivityId, setSwipedActivityId\]/);
  assert.match(recapSource, /open=\{swipedActivityId === activity\.id\}/);
  assert.match(recapSource, /onDeleteActivity\(activity\.id\)/);

  const finishGesture = swipeSource.slice(
    swipeSource.indexOf("function finishGesture"),
    swipeSource.indexOf("function handleClickCapture"),
  );
  assert.doesNotMatch(finishGesture, /onRemove/);
  assert.match(swipeSource, /onClick=\{onRemove\}/);
  assert.doesNotMatch(recapSource, /Remove completed item/);
});

test("recap-added completed activity uses a simple Save action", () => {
  assert.match(
    recapSource,
    /initialItem=\{activity\}[\s\S]*submitLabel="Save"/,
  );
  assert.match(
    recapSource,
    /<RecapCompletedItemForm[\s\S]*embedded[\s\S]*submitLabel="Save"[\s\S]*onSave=\{\(activity\)/,
  );
  assert.match(formSource, /submitLabel\?: string/);
  assert.match(
    formSource,
    /submitLabel \?\?[\s\S]*initialItem \? "Save changes" : "Add completed item"/,
  );
  assert.match(recapSource, /label="Add something completed"/);
});

test("planned recap Actions are never given a destructive swipe path", () => {
  const plannedActionRenderer = recapSource.slice(
    recapSource.indexOf("function renderAction"),
    recapSource.indexOf("function renderCompletedActivity"),
  );

  assert.match(plannedActionRenderer, /<RecapActionPanel/);
  assert.doesNotMatch(plannedActionRenderer, /SwipeToRemove|onDeleteActivity/);
  assert.doesNotMatch(actionPanelSource, /SwipeToRemove|Trash2|onDelete/);
});

test("already-resolved planned Actions stay compact and do not block saving", () => {
  assert.match(
    recapSource,
    /actions\.find\([\s\S]*!isRecapDraftResolved\(drafts\[action\.id\]\)/,
  );
  assert.match(
    recapSource,
    /const unresolved = actions\.filter\([\s\S]*!isRecapDraftResolved\(drafts\[action\.id\]\)/,
  );
  assert.match(actionPanelSource, /!open &&[\s\S]*draft\.outcomeConfirmed/);
});

test("Quick Recap edits and removes added activity in draft before one atomic save", () => {
  assert.match(
    previousDaySource,
    /onUpdateActivity: \(activity\) =>[\s\S]*current\.map\([\s\S]*item\.id === activity\.id \? activity : item/,
  );
  assert.match(
    previousDaySource,
    /onDeleteActivity: \(activityId\) =>[\s\S]*current\.filter\(\(item\) => item\.id !== activityId\)/,
  );
  assert.match(previousDaySource, /name="unplannedItemId" value=\{item\.id\}/);
  assert.match(
    transitionSource,
    /reconcilePreviousDay\([\s\S]*resolutions,[\s\S]*unplannedWork/,
  );
});

test("historical completed items do not expose unsupported planning fields", () => {
  assert.match(
    formSource,
    /showDue=\{false\}[\s\S]*showRecurrence=\{false\}[\s\S]*showReminders=\{false\}/,
  );
  assert.doesNotMatch(recapSource, /showDetails/);
});

test("the shared header X replaces the bottom Cancel action", () => {
  assert.match(
    formSource,
    /<ClarityFormHeader[\s\S]*onClose=\{onCancel\}/,
  );
  assert.match(formSource, /Close completed item form/);
  assert.doesNotMatch(formSource, />\s*Cancel\s*</);
  assert.match(formSource, /"Add completed item"/);
});

test("the optional day reflection evolves into one Clarity day-context disclosure", () => {
  assert.match(noteSource, /<SecondarySettingDisclosure/);
  assert.match(
    noteSource,
    /label=\{`Talk to Clarity about \$\{day\}`\}/,
  );
  assert.match(noteSource, /summary=\{formatDetailsSummary\(value\)\}/);
  assert.match(noteSource, /expanded=\{open\}/);
  assert.match(noteSource, /buildDayClarityHref\(localDate\)/);
  assert.match(noteSource, /Day reflection for \$\{day\}/);
  assert.match(recapSource, /open=\{auxiliaryPanel === "note"\}/);
  assert.doesNotMatch(noteSource, /ClarityFormHeader|<h[1-6]/);
  assert.match(
    recapSource,
    /const \[auxiliaryPanel, setAuxiliaryPanel\] = useState<string \| null>\(\s*null/,
  );
  assert.doesNotMatch(noteSource, /bg-card|rounded-2xl/);
});

test("completed-item fields do not add nested card surfaces", () => {
  assert.equal(formSource.match(/bg-card/g)?.length, 1);
  assert.doesNotMatch(formSource, /bg-secondary|bg-accent/);
  assert.match(
    formSource,
    /rounded-2xl border border-border bg-card p-5 text-foreground/,
  );
});

test("Quick Recap removes the ready summary without a replacement panel", () => {
  assert.doesNotMatch(recapSource, /Ready to save|outcomeSummary/);
  assert.doesNotMatch(recapSource, /Review details|Hide details/);
  assert.doesNotMatch(recapSource, /reviewDetailsOpen|detailsVisible/);
  assert.match(recapSource, /actions\.map\(\(action\) =>\s*renderAction/);
});

test("planned cards do not get a redundant Needs review section heading", () => {
  assert.doesNotMatch(recapSource, /Needs review ·|reviewSectionHeading/);
  assert.match(
    recapSource,
    /unresolvedCount >= 2[\s\S]*Mark remaining as didn&apos;t happen/,
  );
  assert.doesNotMatch(recapSource, /Rest of the day changed\?/);
});

test("the remaining-action shortcut is secondary and updates unresolved Actions only", () => {
  assert.match(
    recapSource,
    /<Button[\s\S]*variant="ghost"[\s\S]*aria-expanded=\{plansChangedOpen\}[\s\S]*Mark remaining as didn&apos;t happen/,
  );
  assert.match(
    recapSource,
    /className="h-10 shrink-0 rounded-xl px-2 text-sm text-muted-foreground"/,
  );
  assert.match(
    recapSource,
    /unresolved\.forEach\(\(action\) => \{[\s\S]*outcome: "not_done"[\s\S]*outcomeConfirmed: true/,
  );
});

test("unplanned completion and day note share the single-open disclosure state", () => {
  assert.match(
    recapSource,
    /<SecondarySettingDisclosure[\s\S]*icon=\{CirclePlus\}[\s\S]*label="Add something completed"/,
  );
  assert.match(
    recapSource,
    /expanded=\{auxiliaryPanel === "completed:new"\}/,
  );
  assert.match(recapSource, /showDone=\{false\}/);
  assert.match(recapSource, /<RecapDayContextField[\s\S]*open=\{auxiliaryPanel === "note"\}/);
});

test("Quick Recap suppresses bottom navigation only while an editor is active", () => {
  assert.match(recapSource, /onEditorActiveChange\?: \(active: boolean\) => void/);
  assert.match(
    recapSource,
    /input:not\(\[type="hidden"\]\), textarea, select/,
  );
  assert.match(recapSource, /editorFieldFocused \|\| plansChangedOpen \|\| auxiliaryEditorOpen/);
  assert.match(
    recapScreenSource,
    /onEditorActiveChange=\{setEditorActive\}/,
  );
  assert.match(
    recapScreenSource,
    /hideBottomNavigation=\{editorActive\}/,
  );
  assert.match(appShellSource, /!hideBottomNavigation &&/);
  assert.match(
    appShellSource,
    /pb-\[max\(1\.5rem,env\(safe-area-inset-bottom\)\)\]/,
  );
});

test("unplanned completion persistence remains separate from planned resolutions", () => {
  assert.match(
    transitionSource,
    /const unplannedWork: PreviousDayUnplannedWork\[\]/,
  );
  assert.match(transitionSource, /outcome: "finished"/);
  assert.match(transitionSource, /completionTimeUnknown: !completionTime/);
  assert.match(
    transitionSource,
    /reconcilePreviousDay\([\s\S]*resolutions,[\s\S]*unplannedWork/,
  );
});

test("Quick Recap day note is rendered from the saved Day Record in Calendar history", () => {
  const calendarHistorySource = readFileSync(
    new URL(
      "../../components/clarity/calendar-history.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    calendarHistorySource,
    /const context = summary\.contextSummary \?\? record\.notes/,
  );
  assert.match(calendarHistorySource, /Day reflection/);
  assert.doesNotMatch(
    calendarHistorySource,
    /contextSummary[\s\S]*createCommitment|contextSummary[\s\S]*deadline/,
  );
});
