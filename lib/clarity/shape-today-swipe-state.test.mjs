import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveShapeTodaySwipeItem } from "./shape-today-swipe.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const proposedPlan = read("../../components/clarity/proposed-plan.tsx");
const dailyCommitments = read(
  "../../components/clarity/daily-commitments.tsx",
);
const swipeToRemove = read("../../components/clarity/swipe-to-remove.tsx");

test("opening another Shape Today swipe item replaces the previous item", () => {
  const actionKey = "action:action-a";
  const commitmentKey = "commitment:commitment-b";

  let openItem = resolveShapeTodaySwipeItem(null, actionKey, true);
  assert.equal(openItem, actionKey);

  openItem = resolveShapeTodaySwipeItem(openItem, commitmentKey, true);
  assert.equal(openItem, commitmentKey);

  openItem = resolveShapeTodaySwipeItem(openItem, actionKey, false);
  assert.equal(openItem, commitmentKey, "a stale close cannot close the newer row");

  openItem = resolveShapeTodaySwipeItem(openItem, commitmentKey, false);
  assert.equal(openItem, null);
});

test("Actions and Calendar occurrences consume one parent-owned swipe key", () => {
  assert.match(
    proposedPlan,
    /const \[swipedItemKey, setSwipedItemKey\] = useState<string \| null>\(null\)/,
  );
  assert.match(proposedPlan, /const swipeItemKey = `action:\$\{action\.id\}`/);
  assert.match(
    proposedPlan,
    /open=\{swipedItemKey === swipeItemKey\}/,
  );
  assert.match(
    proposedPlan,
    /openSwipeItemKey=\{swipedItemKey\}[\s\S]*onOpenSwipeItemChange=\{handleSwipeOpenChange\}/,
  );
  assert.match(
    dailyCommitments,
    /swipeItemKey=\{`commitment:\$\{item\.value\.id\}`\}/,
  );
  assert.match(
    dailyCommitments,
    /openSwipeItemKey === `commitment:\$\{item\.value\.id\}`/,
  );
});

test("outside taps, card expansion, and Reorder close the shared swipe item", () => {
  assert.match(
    proposedPlan,
    /document\.addEventListener\("pointerdown", closeOnOutsidePress\)/,
  );
  assert.match(
    proposedPlan,
    /const handleActionToggle[\s\S]*setSwipedItemKey\(null\)/,
  );
  assert.match(
    proposedPlan,
    /handleExpandedItemChange[\s\S]*setSwipedItemKey\(null\)[\s\S]*setExpandedItemKey\(itemKey\)/,
  );
  assert.match(
    proposedPlan,
    /function enterReorderMode[\s\S]*setSwipedItemKey\(null\)[\s\S]*setReorderMode\(true\)/,
  );
});

test("vertical scrolling still cancels swipe without capturing the pointer", () => {
  const verticalBranch = swipeToRemove.slice(
    swipeToRemove.indexOf('if (gesture.intent === "vertical")'),
    swipeToRemove.indexOf('if (gesture.intent !== "horizontal")'),
  );

  assert.match(verticalBranch, /moveCard\(0\)/);
  assert.match(verticalBranch, /onOpenChange\(false\)/);
  assert.doesNotMatch(verticalBranch, /preventDefault|setPointerCapture/);
});

test("destructive labels remain occurrence-aware", () => {
  assert.match(dailyCommitments, /recurringEvent \? "Skip today" : "Remove today"/);
  assert.match(
    proposedPlan,
    /actionLabel=\{action\.source_routine_id \? "Skip today" : "Remove"\}/,
  );
  assert.match(
    proposedPlan,
    /pendingLabel=\{action\.source_routine_id \? "Skipping…" : "Removing…"\}/,
  );
});
