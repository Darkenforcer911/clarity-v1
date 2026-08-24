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
  assert.match(formSource, />What did you do\?<\/span>/);
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
  assert.match(formSource, /label="When"/);
  assert.match(
    formSource,
    /summary=\{formatCompletionTimeSummary\(completionTime\)\}/,
  );
  assert.match(
    formSource,
    /if \(!\/\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$\/\.test\(value\)\) \{\s*return "Anytime"/,
  );
});

test("completion time uses the shared reliable native-time selector", () => {
  assert.match(
    formSource,
    /import \{ TimeSelector \} from "\.\/time-selector"/,
  );
  assert.match(
    formSource,
    /<TimeSelector[\s\S]*name="completionTime"[\s\S]*label="When"[\s\S]*summary=\{formatCompletionTimeSummary\(completionTime\)\}/,
  );
  assert.doesNotMatch(formSource, /<Input\s+[\s\S]*?type="time"/);
});

test("selecting and removing time retains the existing canonical value", () => {
  assert.match(
    formSource,
    /onChange=\{\(value\) => \{\s*setCompletionTime\(value\)/,
  );
  assert.match(
    formSource,
    /onRemove=\{\(\) => \{\s*setCompletionTime\(""\)/,
  );
  assert.match(timeSelectorSource, /Remove time/);
});

test("Quick Recap reuses the same native TimeSelector as Action", () => {
  const actionFieldsSource = readFileSync(
    new URL("../../components/clarity/action-fields.tsx", import.meta.url),
    "utf8",
  );
  assert.match(actionFieldsSource, /<OptionalTimeSelector/);
  assert.match(formSource, /<TimeSelector/);
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

test("historical completed items do not expose unsupported planning fields", () => {
  assert.doesNotMatch(
    formSource,
    /Details|Estimated duration|Repeats|Reminders|DetailsControl|RecurrenceControl/,
  );
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

test("the day note is a collapsed shared disclosure with preview and Done", () => {
  assert.match(noteSource, /<SecondarySettingDisclosure/);
  assert.match(noteSource, /label=\{`Note about \$\{day\}`\}/);
  assert.match(noteSource, /summary=\{formatDetailsSummary\(value\)\}/);
  assert.match(noteSource, /expanded=\{open\}/);
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
  assert.match(recapSource, /unresolvedCount >= 2[\s\S]*Rest of the day changed\?/);
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
  assert.match(appShellSource, /!navigationHidden &&/);
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
