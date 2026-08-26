import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../../app/(app)/life-model/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL("../../components/clarity/life-model-view.tsx", import.meta.url),
  "utf8",
);
const actionsSource = readFileSync(
  new URL("../../app/(app)/life-model/actions.ts", import.meta.url),
  "utf8",
);
const mutationsSource = readFileSync(
  new URL("./life-model-mutations.ts", import.meta.url),
  "utf8",
);
const accountMenuSource = readFileSync(
  new URL("../../components/clarity/account-menu.tsx", import.meta.url),
  "utf8",
);
const bottomNavigationSource = readFileSync(
  new URL("../../components/clarity/bottom-navigation.tsx", import.meta.url),
  "utf8",
);

test("Life Model route renders the canonical authenticated read model", () => {
  assert.match(pageSource, /getLifeModel\(\)/);
  assert.match(pageSource, /<LifeModelView model=\{model\}/);
  assert.match(pageSource, /AuthenticationRequiredError/);
  assert.doesNotMatch(accountMenuSource, /href="\/life-model"|Life Model/);
  assert.match(
    bottomNavigationSource,
    /href: "\/life-model", label: "Life", icon: BookHeart/,
  );
  assert.match(bottomNavigationSource, /pathname\.startsWith\(item\.href\)/);
});

test("Life Areas own all canonical read-model groupings", () => {
  assert.match(viewSource, /model\.areas\.map\(\(area\)/);
  assert.match(viewSource, /area\.currentState &&/);
  assert.match(viewSource, /area\.desiredState &&/);
  assert.match(viewSource, /area\.goals\.map/);
  assert.match(viewSource, /area\.projects\.map/);
  assert.match(viewSource, /area\.routines\.map/);
  assert.match(viewSource, /area\.currentContexts\.map/);
  assert.match(viewSource, /area\.openQuestions\.map/);
  assert.match(viewSource, /area\.evidence\.map/);
  for (const heading of [
    "Where you are",
    "Where you want to be",
    "Goals",
    "Projects",
    "Routines",
    "Current Context",
    "Still figuring out",
  ]) {
    assert.match(viewSource, new RegExp(`title="${heading}"`));
  }
  assert.doesNotMatch(viewSource, /<LifeSection title="Evidence"/);
});

test("empty canonical sections are omitted instead of rendering None rows", () => {
  assert.match(viewSource, /area\.goals\.length > 0 &&/);
  assert.match(viewSource, /area\.projects\.length > 0 &&/);
  assert.match(viewSource, /area\.routines\.length > 0 &&/);
  assert.match(viewSource, /area\.currentContexts\.length > 0 &&/);
  assert.match(viewSource, /area\.openQuestions\.length > 0 &&/);
  assert.match(viewSource, /area\.evidence\.length > 0 &&/);
  assert.doesNotMatch(viewSource, />\s*None\s*</);
});

test("one parent-owned editor state controls all Life Model editors", () => {
  assert.match(viewSource, /const \[editorKey, setEditorKey\] = useState<string \| null>\(null\)/);
  assert.match(viewSource, /function openEditor\(key: string\)/);
  assert.doesNotMatch(viewSource, /expandedEditorIds|openEditors/);
  assert.match(viewSource, /<ClarityFormHeader/);
  assert.match(viewSource, /onClose=\{onClose\}/);
});

test("canonical mutation coverage remains intact while strategic transitions leave the read surface", () => {
  for (const operation of [
    "renameLifeArea",
    "reorderLifeAreas",
    "archiveLifeArea",
    "setCurrentState",
    "updateGoal",
    "transitionGoal",
    "updateProject",
    "transitionProject",
    "updateRoutine",
    "transitionRoutine",
    "updateContext",
    "endContext",
    "correctEvidence",
    "archiveEvidence",
  ]) {
    assert.match(actionsSource, new RegExp(`"${operation}"`), operation);
  }

  for (const strategicControl of [
    "Commit to goal",
    "Mark achieved",
    "Abandon goal",
    "Cancel project",
    "End routine",
  ]) {
    assert.doesNotMatch(viewSource, new RegExp(strategicControl));
  }
  assert.match(viewSource, /aria-label=\{`Correct \$\{title\}`\}/);
});

test("Life Area administration is available only from a subtle menu", () => {
  assert.match(viewSource, /function AreaAdminMenu/);
  assert.match(viewSource, /<MoreHorizontal \/>/);
  assert.match(viewSource, /<Pencil \/> Rename/);
  assert.match(viewSource, /<Archive \/> Archive/);
  assert.doesNotMatch(viewSource, /function AreaOrderButton|Move Life Area|>Up<|>Down</);
  assert.doesNotMatch(viewSource, /> Edit area</);
  assert.doesNotMatch(viewSource, /> Add current state</);
});

test("Life is read-first and routes meaningful changes through proposal plumbing", () => {
  assert.match(viewSource, /Something changed\?/);
  assert.match(viewSource, /Tell Mentor what’s new/);
  assert.match(viewSource, /Talk to Mentor/);
  assert.match(viewSource, /href=\{mentorLifeChangeHref\}/);
  assert.match(viewSource, /What matters now/);
});

test("archive controls remain soft canonical transitions", () => {
  assert.match(viewSource, /Archive Life Area/);
  assert.match(viewSource, /Remove from Life Model/);
  assert.match(actionsSource, /archiveLifeArea/);
  assert.match(actionsSource, /archiveLifeEvidence/);
  assert.doesNotMatch(mutationsSource, /\.delete\(|delete from/i);
});

test("all writes use authenticated server RPC calls and refresh the canonical read", () => {
  assert.match(mutationsSource, /getAuthenticatedUserAndProfile\(\)/);
  assert.match(mutationsSource, /supabase as LifeModelRpcClient/);
  assert.match(mutationsSource, /\.rpc\(\s*name as never/);
  assert.doesNotMatch(mutationsSource, /createClient|\.from\(/);
  assert.match(actionsSource, /revalidatePath\("\/life-model"\)/);

  for (const rpc of [
    "rename_life_area",
    "reorder_life_areas",
    "archive_life_area",
    "set_life_area_current_state",
    "update_goal",
    "transition_goal_status",
    "update_project",
    "transition_project_status",
    "update_routine",
    "transition_routine_status",
    "update_current_context",
    "end_current_context",
    "correct_life_evidence",
    "archive_life_evidence",
  ]) {
    assert.match(mutationsSource, new RegExp(`"${rpc}"`), rpc);
  }
});

test("Life Model V1 does not add intelligence or a parallel client store", () => {
  assert.doesNotMatch(viewSource, /AI inference|Evidence creation/i);
  assert.doesNotMatch(viewSource, /localStorage|sessionStorage|createClient/);
  assert.match(viewSource, /What Clarity currently knows about you\./);
  assert.match(
    viewSource,
    /Your life will take shape here as Clarity learns about you\./,
  );
  assert.doesNotMatch(viewSource, /confirmed Life Model will appear here/i);
});

test("Goal editing exposes only canonical wording fields", () => {
  const goalEditor = viewSource.slice(
    viewSource.indexOf("function GoalEditor"),
    viewSource.indexOf("function ProjectEditor"),
  );

  assert.match(goalEditor, /<Field label="Goal">/);
  assert.match(goalEditor, /What does success look like\?/);
  assert.doesNotMatch(
    goalEditor,
    /Target timing|Target date|Target start|Target end|Target confidence|targetStartDate|targetEndDate|targetConfidence/,
  );
});

test("ordinary Goal wording edits preserve hidden canonical target metadata", () => {
  const goalCase = actionsSource.slice(
    actionsSource.indexOf('case "updateGoal"'),
    actionsSource.indexOf('case "transitionGoal"'),
  );

  assert.match(goalCase, /getLifeModel\(\)/);
  assert.match(goalCase, /existingGoal\.target_start_date/);
  assert.match(goalCase, /existingGoal\.target_end_date/);
  assert.match(goalCase, /existingGoal\.target_confidence/);
  assert.doesNotMatch(goalCase, /formValue\(formData, "target/);
});
