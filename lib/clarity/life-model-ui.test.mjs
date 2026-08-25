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
  assert.match(viewSource, /model\.areas\.map\(\(area, areaIndex\)/);
  assert.match(viewSource, /area\.currentState &&/);
  assert.match(viewSource, /area\.goals\.map/);
  assert.match(viewSource, /area\.projects\.map/);
  assert.match(viewSource, /area\.routines\.map/);
  assert.match(viewSource, /area\.currentContexts\.map/);
  assert.match(viewSource, /area\.evidence\.map/);
  for (const heading of [
    "Current state",
    "Goals",
    "Projects",
    "Routines",
    "Current context",
    "Evidence",
  ]) {
    assert.match(viewSource, new RegExp(`title="${heading}"`));
  }
});

test("empty canonical sections are omitted instead of rendering None rows", () => {
  assert.match(viewSource, /area\.goals\.length > 0 &&/);
  assert.match(viewSource, /area\.projects\.length > 0 &&/);
  assert.match(viewSource, /area\.routines\.length > 0 &&/);
  assert.match(viewSource, /area\.currentContexts\.length > 0 &&/);
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

test("editing and transitions submit canonical operation names", () => {
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

  assert.match(viewSource, /status="active"[\s\S]*Commit to goal/);
  assert.match(viewSource, /status="achieved"[\s\S]*Mark achieved/);
  assert.match(viewSource, /status="abandoned"[\s\S]*Abandon goal/);
  assert.match(viewSource, /status="paused"[\s\S]*Pause/);
  assert.match(viewSource, /status="completed"[\s\S]*Complete/);
  assert.match(viewSource, /status="cancelled"[\s\S]*Cancel project/);
  assert.match(viewSource, /status="ended"[\s\S]*End routine/);
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
  assert.doesNotMatch(viewSource, /Mentor|AI inference|Evidence creation/i);
  assert.doesNotMatch(viewSource, /localStorage|sessionStorage|createClient/);
  assert.match(viewSource, /What Clarity currently knows about you\./);
  assert.match(
    viewSource,
    /Clarity will build this with you as it learns about your life\./,
  );
  assert.doesNotMatch(viewSource, /confirmed Life Model will appear here/i);
});
