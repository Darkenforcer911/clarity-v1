import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const actionDetail = read("../../components/clarity/action-detail.tsx");
const actionWorkspace = read("../../components/clarity/action-workspace.tsx");
const correctionForm = read(
  "../../components/clarity/correct-completion-time-form.tsx",
);
const completionEditor = read(
  "../../components/clarity/completion-time-editor.tsx",
);
const timeSelector = read("../../components/clarity/time-selector.tsx");
const completionControl = read(
  "../../components/clarity/action-completion-control.tsx",
);
const workspaceAction = read(
  "../../app/(app)/today/action-workspace-actions.ts",
);
const workspaceService = read("./action-workspace-service.ts");

test("completed Actions show a compact correction summary by default", () => {
  assert.match(actionDetail, /completed && \(\s*<CorrectCompletionTimeForm/);
  assert.match(
    actionDetail,
    /!completionTimeUnknown && completedAt[\s\S]*`Completed \$\{completedAt\}`[\s\S]*`Completed \$\{formatShortLocalDate\(action\.local_date\)\}`/,
  );
  assert.match(correctionForm, /const \[editing, setEditing\] = useState\(false\)/);
  assert.match(correctionForm, /data-completion-time-summary/);
  assert.match(correctionForm, /\{completionSummary\}[\s\S]*>·<[\s\S]*>\s*Edit time\s*</);
  assert.match(correctionForm, /flex-wrap/);
  assert.doesNotMatch(actionWorkspace, /Correct completion time|completion-time/);
});

test("Edit reveals the compact shared TimeSelector and no raw time field", () => {
  assert.match(correctionForm, /onClick=\{\(\) => setEditing\(true\)\}/);
  assert.match(correctionForm, /<CompletionTimeEditor/);
  assert.match(completionEditor, /<TimeSelector/);
  assert.match(completionEditor, /label="Completion time"/);
  assert.doesNotMatch(completionEditor, /<Input[\s\S]*type="time"/);
  assert.match(timeSelector, /data-slot="when-time-selector"/);
  assert.match(completionEditor, /w-full min-w-0 max-w-full/);
  assert.match(completionEditor, /grid min-w-0 grid-cols-2/);
});

test("Save and Cancel both collapse the correction editor", () => {
  assert.match(
    correctionForm,
    /if \(state\.success\) \{\s*setEditing\(false\);\s*router\.refresh\(\)/,
  );
  assert.match(correctionForm, /onCancel=\{\(\) => setEditing\(false\)\}/);
  assert.match(completionEditor, />\s*Cancel\s*</);
  assert.match(completionEditor, /saving \? "Saving…" : "Save"/);
});

test("Time not recorded keeps the existing canonical correction payload", () => {
  assert.match(completionEditor, /Time not recorded/);
  assert.match(correctionForm, /formData\.set\("completionTime", draft\.completionTime\)/);
  assert.match(
    correctionForm,
    /if \(draft\.timeUnknown\) \{\s*formData\.set\("timeUnknown", "on"\)/,
  );
  assert.match(workspaceAction, /correctCompletionTimeAction/);
  assert.match(
    workspaceAction,
    /completionTime: String\(formData\.get\("completionTime"\)[\s\S]*timeUnknown: formData\.get\("timeUnknown"\) === "on"/,
  );
});

test("completion correction preserves scheduled time and recurrence semantics", () => {
  const correctionMethod = workspaceService.slice(
    workspaceService.indexOf("async correctCompletionTime("),
    workspaceService.indexOf("async removeProposedAction("),
  );

  assert.match(correctionMethod, /data\.action\.local_date !== getLocalDate\(data\.profile\.timezone\)/);
  assert.match(correctionMethod, /Completion time cannot be in the future/);
  assert.match(correctionMethod, /"correct_action_completion_time"/);
  assert.match(correctionMethod, /p_completed_at: completedAt/);
  assert.match(correctionMethod, /p_time_unknown: input\.timeUnknown/);
  assert.doesNotMatch(correctionMethod, /scheduled_time|scheduledTime/);
  assert.doesNotMatch(correctionMethod, /routine|recurrence/);
});

test("Undo done remains a separate completion correction", () => {
  assert.match(actionDetail, /<ActionCompletionControl/);
  assert.match(completionControl, />\s*Undo done\s*</);
  assert.doesNotMatch(completionEditor, /Undo done/);
});
