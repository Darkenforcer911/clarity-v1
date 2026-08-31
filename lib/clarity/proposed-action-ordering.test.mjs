import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { selectNextActiveAction } from "./active-today-scheduling.ts";
import {
  moveProposedActionByStep,
  moveProposedActionToIndex,
  proposedActionOrdersMatch,
  reconcileProposedActionOrder,
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
  assert.match(reorderControl, /touch-none/);
  assert.match(reorderControl, /setPointerCapture/);
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
  assert.match(workspaceService, /"reorder_proposed_daily_actions"/);
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
