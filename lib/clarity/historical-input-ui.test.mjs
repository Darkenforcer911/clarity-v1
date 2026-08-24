import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  initialHistoricalCompletionTime,
  submittedHistoricalCompletionTime,
} from "./historical-completion-time.ts";

const historySource = readFileSync(
  new URL("../../components/clarity/calendar-history.tsx", import.meta.url),
  "utf8",
);
const agendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const correctionEditorSource = readFileSync(
  new URL(
    "../../components/clarity/historical-outcome-correction-editor.tsx",
    import.meta.url,
  ),
  "utf8",
);
const recapFormSource = readFileSync(
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
const editorContextSource = readFileSync(
  new URL(
    "../../components/clarity/app-shell-editor-context.tsx",
    import.meta.url,
  ),
  "utf8",
);
const appShellSource = readFileSync(
  new URL("../../components/clarity/app-shell.tsx", import.meta.url),
  "utf8",
);
const calendarActionsSource = readFileSync(
  new URL("../../app/(app)/calendar/actions.ts", import.meta.url),
  "utf8",
);

test("retrospective completion stays Anytime until an actual time is known", () => {
  assert.equal(
    initialHistoricalCompletionTime({
      completed: false,
      existingCompletionTime: "00:47",
    }),
    "",
  );
  assert.equal(
    submittedHistoricalCompletionTime({
      completed: true,
      selectedCompletionTime: "",
    }),
    null,
  );
  assert.equal(
    submittedHistoricalCompletionTime({
      completed: true,
      selectedCompletionTime: "21:45",
    }),
    "21:45",
  );
});

test("an existing authoritative completion time is preserved", () => {
  assert.equal(
    initialHistoricalCompletionTime({
      completed: true,
      existingCompletionTime: "21:45",
    }),
    "21:45",
  );
});

test("Quick Recap and Past Calendar share the completed-item form language", () => {
  assert.match(recapSource, /<RecapCompletedItemForm/);
  assert.match(historySource, /<RecapCompletedItemForm/);
  assert.match(historySource, /<SecondarySettingDisclosure/);
  assert.match(historySource, /label="Add something completed"/);
  assert.match(
    historySource,
    /summary="Something you did that wasn't planned"/,
  );
  assert.match(recapFormSource, />What did you do\?<\/span>/);
  assert.match(recapFormSource, /label="When"/);
  assert.match(recapFormSource, /return "Anytime"/);
  assert.doesNotMatch(
    historySource,
    /completedOnly|What did you complete\?|Time — optional/,
  );
});

test("Past Calendar completed items use the compact Done activity card", () => {
  assert.match(historySource, /data-slot="historical-completed-activity-card"/);
  assert.match(
    historySource,
    /overflow-hidden rounded-2xl border border-border bg-card/,
  );
  assert.match(historySource, /\{`Done · \$\{time \?\? "Anytime"\}`\}/);
  assert.match(historySource, /<ChevronDown/);
});

test("historical corrections use controlled buttons instead of raw radios", () => {
  assert.match(historySource, /<HistoricalOutcomeCorrectionEditor/);
  assert.match(agendaSource, /<HistoricalOutcomeCorrectionEditor/);
  assert.match(correctionEditorSource, /aria-pressed=\{outcome === value\}/);
  assert.doesNotMatch(correctionEditorSource, /type="radio"/);
  assert.match(correctionEditorSource, /title="Correct outcome"/);
  assert.match(correctionEditorSource, /onClose=\{onCancel\}/);
  assert.doesNotMatch(correctionEditorSource, />\s*Cancel\s*</);
});

test("Completed correction alone exposes the shared When and Anytime control", () => {
  assert.match(correctionEditorSource, /\{completed && \(/);
  assert.match(correctionEditorSource, /label="When"/);
  assert.match(correctionEditorSource, /<TimeSelector/);
  assert.match(correctionEditorSource, /return "Anytime"/);
  assert.match(correctionEditorSource, /onRemove=\{\(\) => setCompletionTime\(""\)\}/);
  assert.match(
    correctionEditorSource,
    /value=\{completed \? completionTime : ""\}/,
  );
  assert.match(
    agendaSource,
    /\["attended", "Completed"\][\s\S]*\["missed", "Missed"\][\s\S]*\["cancelled", "Cancelled"\]/,
  );
  assert.doesNotMatch(agendaSource, /\["not_recorded", "Not recorded"\]/);
  assert.match(
    correctionEditorSource,
    /disabled=\{submitting \|\| !outcomeSelected\}/,
  );
  assert.match(
    correctionEditorSource,
    /initialHistoricalCompletionTime\(\{[\s\S]*completed: initialOutcome === completedOutcome/,
  );
  assert.match(
    calendarActionsSource,
    /submittedHistoricalCompletionTime\(\{[\s\S]*selectedCompletionTime: parsed\.completedTime/,
  );
});

test("correction Note is a collapsed disclosure and X is non-saving", () => {
  assert.match(correctionEditorSource, /label="Note"/);
  assert.match(correctionEditorSource, /summary=\{formatDetailsSummary\(note\)\}/);
  assert.match(correctionEditorSource, /openSection === "note"/);
  assert.match(correctionEditorSource, /onCancel: \(\) => void/);
  assert.match(correctionEditorSource, /onClose=\{onCancel\}/);
});

test("historical add and correction keep separate persistence actions", () => {
  assert.match(historySource, /createDayCorrectionAction/);
  assert.match(historySource, /correctHistoricalDailyActionOutcomeAction/);
  assert.match(agendaSource, /correctCalendarEventOccurrenceOutcomeAction/);
  assert.match(historySource, /formData\.set\("correctionType", "completed_item"\)/);
});

test("historical editors register with the shared bottom-navigation guard", () => {
  assert.match(historySource, /useAppShellEditorState\(editing\)/);
  assert.match(historySource, /useAppShellEditorState\(true\)/);
  assert.match(agendaSource, /useAppShellEditorState\(editing\)/);
  assert.match(editorContextSource, /register\?\.\(id, active\)/);
  assert.match(editorContextSource, /return \(\) => register\?\.\(id, false\)/);
  assert.match(appShellSource, /activeEditorIds\.size > 0/);
  assert.match(appShellSource, /!navigationHidden &&/);
});
