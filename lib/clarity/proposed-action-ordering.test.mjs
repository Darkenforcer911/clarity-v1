import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { selectNextActiveAction } from "./active-today-scheduling.ts";
import {
  constrainTimedActionOrder,
  getDraggedRowTop,
  getUntimedActionOrder,
  getValidUntimedInsertionSlots,
  moveProposedActionByStep,
  moveProposedActionToIndex,
  moveUntimedActionByStep,
  moveUntimedActionToIndex,
  moveUntimedActionWithinUntimedSlots,
  proposedActionOrdersMatch,
  reconcileProposedActionOrder,
  resolveDiscreteInsertionSlot,
} from "./proposed-action-ordering.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const migration = read(
  "../../supabase/migrations/20260831000001_reorder_proposed_daily_actions.sql",
);
const proposedPlan = read("../../components/clarity/proposed-plan.tsx");
const reorderControl = read(
  "../../components/clarity/proposed-action-reorder-control.tsx",
);
const workspaceActions = read(
  "../../app/(app)/today/action-workspace-actions.ts",
);
const workspaceService = read("./action-workspace-service.ts");
const swipeToRemove = read(
  "../../components/clarity/swipe-to-remove.tsx",
);
const dailyCommitments = read(
  "../../components/clarity/daily-commitments.tsx",
);

const orderingActions = [
  { id: "four", scheduled_time: "2026-09-03T06:00:00.000Z" },
  { id: "nine", scheduled_time: "2026-09-03T11:00:00.000Z" },
  { id: "first", scheduled_time: null },
  { id: "second", scheduled_time: null },
];

test("successful drag reorder and reverse ordering retain every Action ID", () => {
  assert.deepEqual(
    moveProposedActionToIndex(["a", "b", "c"], "a", 2),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    moveProposedActionToIndex(["a", "b", "c"], "c", 0),
    ["c", "a", "b"],
  );
  assert.deepEqual(moveProposedActionByStep(["a", "b"], "a", 1), [
    "b",
    "a",
  ]);
});

test("idempotent ordering and server reconciliation preserve accepted order", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(moveProposedActionToIndex(order, "b", 1), order);
  assert.equal(proposedActionOrdersMatch(order, [...order]), true);
  assert.deepEqual(
    reconcileProposedActionOrder(["b", "a"], ["a", "b", "c"]),
    ["b", "a", "c"],
  );
  assert.match(migration, /if v_current_order = p_ordered_action_ids then\s+return;/i);
});

test("fixed-time Actions remain chronological while untimed priority moves around them", () => {
  assert.deepEqual(
    constrainTimedActionOrder(
      ["nine", "first", "four", "second"],
      orderingActions,
    ),
    ["four", "first", "nine", "second"],
  );
  assert.deepEqual(
    moveUntimedActionToIndex(
      ["four", "first", "nine", "second"],
      "second",
      0,
      orderingActions,
    ),
    ["second", "four", "first", "nine"],
  );
  assert.deepEqual(
    moveUntimedActionToIndex(
      ["second", "four", "first", "nine"],
      "second",
      2,
      orderingActions,
    ),
    ["four", "first", "second", "nine"],
  );
  assert.deepEqual(
    moveUntimedActionByStep(
      ["four", "first", "nine", "second"],
      "first",
      1,
      orderingActions,
    ),
    ["four", "nine", "first", "second"],
  );
});

test("attempting to move a timed Action snaps back to chronological order", () => {
  assert.deepEqual(
    moveUntimedActionToIndex(
      ["four", "first", "nine", "second"],
      "nine",
      0,
      orderingActions,
    ),
    ["four", "first", "nine", "second"],
  );
  assert.deepEqual(
    constrainTimedActionOrder(
      ["nine", "four", "first", "second"],
      orderingActions,
    ),
    ["four", "nine", "first", "second"],
  );
});

test("drag pickup preserves the original finger-to-card grab offset", () => {
  const sourceTop = 100;
  const initialPointerY = 120;
  const grabOffsetY = initialPointerY - sourceTop;

  assert.equal(getDraggedRowTop(129, grabOffsetY), 109);
  assert.equal(getDraggedRowTop(180, grabOffsetY), 160);
});

test("insertion changes only after crossing a row midpoint and hysteresis band", () => {
  const rowMidpoints = [
    { actionId: "dragged", midpointY: 100 },
    { actionId: "second", midpointY: 200 },
    { actionId: "third", midpointY: 300 },
  ];
  const input = {
    currentSlot: 0,
    draggedActionId: "dragged",
    rowMidpoints,
    validSlots: [0, 1, 2],
    hysteresisPx: 8,
  };

  assert.equal(
    resolveDiscreteInsertionSlot({ ...input, draggedCenterY: 199 }),
    0,
  );
  assert.equal(
    resolveDiscreteInsertionSlot({ ...input, draggedCenterY: 207 }),
    0,
  );
  assert.equal(
    resolveDiscreteInsertionSlot({ ...input, draggedCenterY: 208 }),
    1,
  );
});

test("slot resolution uses the nearest allowlisted position", () => {
  assert.equal(
    resolveDiscreteInsertionSlot({
      currentSlot: 0,
      draggedActionId: "dragged",
      draggedCenterY: 310,
      rowMidpoints: [
        { actionId: "dragged", midpointY: 100 },
        { actionId: "fixed-four", midpointY: 200 },
        { actionId: "fixed-nine", midpointY: 300 },
      ],
      validSlots: [0, 2],
      hysteresisPx: 8,
    }),
    2,
  );
});

test("valid untimed slots preserve chronological timed anchors", () => {
  assert.deepEqual(
    getValidUntimedInsertionSlots(
      ["four", "first", "nine", "second"],
      "first",
      orderingActions,
    ),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    getValidUntimedInsertionSlots(
      ["four", "first", "nine", "second"],
      "nine",
      orderingActions,
    ),
    [],
  );
});

test("fixed-time Actions and Calendar commitments share one chronological presentation", () => {
  assert.match(dailyCommitments, /orderLaterTodayItems\(\{/);
  assert.match(dailyCommitments, /commitments: sortCalendarCommitments\(commitments\)/);
  assert.match(dailyCommitments, /renderAction\?\.\(item\.value\)/);
  assert.match(dailyCommitments, /<CalendarOccurrenceWorkspace/);
  assert.match(
    proposedPlan,
    /<DailyCommitments[\s\S]*commitments=\{fixedCommitments\}[\s\S]*actions=\{fixedActions\}/,
  );
  assert.match(
    proposedPlan,
    /flexibleActions: flexibleRemainingActions/,
  );
});

test("reordering the flexible list preserves the fixed-time sort slots", () => {
  const current = ["four", "first", "nine", "second"];

  assert.deepEqual(getUntimedActionOrder(current, orderingActions), [
    "first",
    "second",
  ]);
  assert.deepEqual(
    moveUntimedActionWithinUntimedSlots(
      current,
      "second",
      0,
      orderingActions,
    ),
    ["four", "second", "nine", "first"],
  );
  assert.deepEqual(
    moveUntimedActionWithinUntimedSlots(
      current,
      "nine",
      0,
      orderingActions,
    ),
    current,
  );
});

test("the reorder RPC is authenticated, owned, locked, and proposal-only", () => {
  assert.match(
    migration,
    /create function public\.reorder_proposed_daily_actions\(\s*p_daily_plan_id uuid,\s*p_ordered_action_ids uuid\[\]/i,
  );
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /if v_user_id is null then\s+raise exception 'Authentication required'/i);
  assert.match(
    migration,
    /where plan\.id = p_daily_plan_id\s+and plan\.user_id = v_user_id\s+for update/i,
  );
  assert.match(migration, /if v_plan\.status <> 'proposed'/i);
  assert.match(
    migration,
    /from public\.daily_actions as action[\s\S]*order by action\.id\s+for update/i,
  );
});

test("null, duplicate, foreign, missing, and stale Action sets are rejected", () => {
  assert.match(migration, /array_position\(p_ordered_action_ids, null\)/i);
  assert.match(migration, /count\(distinct action_id\)/i);
  assert.match(migration, /cannot contain duplicate IDs/i);
  assert.match(
    migration,
    /action\.user_id = v_user_id[\s\S]*action\.status = 'proposed'[\s\S]*action\.approved_at is null[\s\S]*action\.id = any\(p_ordered_action_ids\)/i,
  );
  assert.match(
    migration,
    /v_input_count <> v_proposed_count\s+or v_matching_count <> v_proposed_count/i,
  );
  assert.match(migration, /Proposed Action order is stale or incomplete/i);
});

test("the authoritative RPC rejects non-chronological fixed-time Actions", () => {
  assert.match(
    migration,
    /lag\(action\.scheduled_time\) over \(order by ordered\.ordinality\)/i,
  );
  assert.match(
    migration,
    /timed_actions\.scheduled_time\s+< timed_actions\.previous_scheduled_time/i,
  );
  assert.match(
    migration,
    /Fixed-time Actions must remain in chronological order/i,
  );
});

test("prior-day plans and accepted active plans cannot be reordered", () => {
  assert.match(migration, /if v_plan\.status <> 'proposed'/i);
  assert.match(
    migration,
    /v_plan\.local_date <> \(clock_timestamp\(\) at time zone v_timezone\)::date/i,
  );
  assert.match(migration, /Only the current local daily plan can be reordered/i);
});

test("the RPC rewrites existing slots collision-safely without touching resolved rows", () => {
  assert.match(
    migration,
    /array_agg\(action\.sort_order order by action\.sort_order, action\.id\)/i,
  );
  assert.match(
    migration,
    /set sort_order = action\.sort_order \+ v_sort_offset[\s\S]*action\.status = 'proposed'[\s\S]*action\.approved_at is null/i,
  );
  assert.match(
    migration,
    /set sort_order = v_sort_slots\[ordered\.ordinality::integer\]/i,
  );
  assert.doesNotMatch(migration, /set\s+status\s*=|delete from public\.daily_actions/i);
});

test("execution is restricted to authenticated users", () => {
  assert.match(
    migration,
    /revoke all on function public\.reorder_proposed_daily_actions\(uuid, uuid\[\]\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.reorder_proposed_daily_actions\(uuid, uuid\[\]\)\s+to authenticated/i,
  );
});

test("Shape Today provides touch drag, accessible fallback, and rollback", () => {
  assert.match(proposedPlan, /<ProposedActionReorderControl/);
  assert.match(reorderControl, /data-reorder-handle/);
  assert.match(proposedPlan, /DRAG_START_THRESHOLD_PX = 8/);
  assert.match(
    proposedPlan,
    /Math\.abs\(event\.clientY - gesture\.startPointerY\)[\s\S]*DRAG_START_THRESHOLD_PX/,
  );
  assert.match(proposedPlan, /setPointerCapture/);
  assert.match(reorderControl, /Move up/);
  assert.match(reorderControl, /Move down/);
  assert.match(
    proposedPlan,
    /reorderProposedActionsInlineAction\(\s*plan\.id,\s*nextOrder/i,
  );
  assert.match(
    proposedPlan,
    /if \(!result\.success\) \{[\s\S]*applyLocalOrder\(previousOrder\)/i,
  );
  assert.match(workspaceActions, /reorderProposedActionsInlineAction/);
  assert.match(
    workspaceActions,
    /console\.error\("Failed to reorder proposed daily actions", error\)/,
  );
  assert.match(workspaceService, /"reorder_proposed_daily_actions"/);
  assert.match(
    workspaceService,
    /"reorder_proposed_daily_actions",\s*\{\s*p_daily_plan_id: planId,\s*p_ordered_action_ids: orderedActionIds/,
  );
});

test("Shape Today exposes drag only through explicit reorder mode", () => {
  assert.match(
    proposedPlan,
    /onClick=\{reorderMode \? exitReorderMode : enterReorderMode\}/,
  );
  assert.match(proposedPlan, /\{reorderMode \? "Done" : "Reorder"\}/);
  assert.match(
    proposedPlan,
    /const movable = reorderMode && action\.scheduled_time === null/,
  );
  assert.match(
    proposedPlan,
    /reorderControl=\{\s*movable \? \(/,
  );
  assert.match(proposedPlan, /enabled=\{!reorderMode\}/);
  assert.match(
    proposedPlan,
    /expanded=\{\s*!reorderMode && expandedActionId === action\.id\s*\}/,
  );
  assert.match(proposedPlan, /reordering=\{reorderMode\}/);
  assert.match(reorderControl, /touch-none select-none/);
  assert.match(
    reorderControl,
    /onPointerDown=\{onPointerDown\}/,
  );
  assert.doesNotMatch(
    proposedPlan,
    /data-proposed-action-index=\{actionIndex\}[\s\S]{0,300}onPointerDown=/,
  );
});

test("mobile drag transforms the one actual keyed row", () => {
  assert.doesNotMatch(proposedPlan, /createPortal\(|cloneNode\(/);
  assert.doesNotMatch(proposedPlan, /dragPreview|DragPreview/);
  assert.doesNotMatch(proposedPlan, /data-proposed-action-insertion-gap/);
  assert.equal(
    [...proposedPlan.matchAll(/<ProposedActionCard/g)].length,
    2,
    "one shared card implementation is rendered for timed and flexible Action groups",
  );
  assert.match(proposedPlan, /row\.style\.transform = `translate3d/);
  assert.match(proposedPlan, /data-dragging-action/);
  assert.match(proposedPlan, /aria-grabbed=\{movable \? dragging : undefined\}/);
  assert.match(proposedPlan, /element\.animate\(/);
  assert.match(proposedPlan, /resolveDiscreteInsertionSlot\(/);
  assert.match(proposedPlan, /getUntimedActionOrder\(/);
  assert.match(proposedPlan, /moveUntimedActionWithinUntimedSlots\(/);
  assert.match(proposedPlan, /bounds\.top \+ bounds\.height \/ 2/);
  assert.match(
    swipeToRemove,
    /\[data-swipe-remove-control\], \[data-reorder-control\]/,
  );
  assert.match(swipeToRemove, /\[touch-action:pan-y\]/);
});

test("reorder mode collapses editors and uses only the compact card representation", () => {
  const actionCard = read(
    "../../components/clarity/proposed-action-card.tsx",
  );

  assert.match(
    proposedPlan,
    /function enterReorderMode[\s\S]*flushSync\(\(\) => \{[\s\S]*setExpandedItemKey\(null\)[\s\S]*setReorderMode\(true\)/,
  );
  assert.match(
    proposedPlan,
    /const grabOffsetY = event\.clientY - bounds\.top/,
  );
  assert.match(
    proposedPlan,
    /function beginDragOrder[\s\S]*positionDraggedRow\(actionId, pointerY\)/,
  );
  assert.match(actionCard, /data-proposed-action-compact/);
  assert.match(
    proposedPlan,
    /setReorderRevision\(\(current\) => current \+ 1\)/,
  );
  assert.match(proposedPlan, /key=\{`\$\{action\.id\}:\$\{reorderRevision\}`\}/);
  assert.match(actionCard, /disabled=\{reordering\}/);
  assert.match(actionCard, /\{!reordering && \(\s*<div[\s\S]*grid-rows-/);
});

test("ending or cancelling drag leaves collapsed resting rows with swipe restored", () => {
  assert.match(
    proposedPlan,
    /function finishDragOrder[\s\S]*snapDraggedRowToSlot\(actionId/,
  );
  assert.match(
    proposedPlan,
    /if \(cancelled\) \{\s*captureRowPositions\(\);\s*applyLocalOrder\(previousOrder\);\s*\}/,
  );
  assert.match(
    proposedPlan,
    /function snapDraggedRowToSlot[\s\S]*transform: "translate3d\(0, 0, 0\)"[\s\S]*duration: 120/,
  );
  assert.match(
    proposedPlan,
    /function completeDragCleanup[\s\S]*row\.style\.transform = ""[\s\S]*setExpandedItemKey\(null\)[\s\S]*setDraggingActionId\(null\)/,
  );
  assert.match(
    proposedPlan,
    /enabled=\{!reorderMode\}/,
  );
  assert.match(
    proposedPlan,
    /function exitReorderMode[\s\S]*setExpandedItemKey\(null\)[\s\S]*setReorderMode\(false\)/,
  );
});

test("Active Today normally reads the first unresolved accepted order", () => {
  const firstAccepted = {
    id: "first",
    scheduled_time: null,
    estimated_minutes: 30,
    sort_order: 0,
  };
  const secondAccepted = {
    id: "second",
    scheduled_time: null,
    estimated_minutes: 30,
    sort_order: 1,
  };

  assert.equal(
    selectNextActiveAction(
      [secondAccepted, firstAccepted],
      "2026-09-01",
      "Australia/Melbourne",
      new Date("2026-08-31T23:00:00.000Z"),
    ),
    firstAccepted,
  );
});
