import assert from "node:assert/strict";
import test from "node:test";

import {
  addedActionDestination,
  addedActionNoticeDestination,
  formatAddedActionNotice,
} from "./add-action-destination.ts";
import {
  ACTIVE_ACTION_SWIPE_CLOSE_THRESHOLD_PX,
  ACTIVE_ACTION_SWIPE_OPEN_THRESHOLD_PX,
  ACTIVE_ACTION_SWIPE_REVEAL_PX,
  resolveActiveActionSwipeIntent,
  resolveActiveActionSwipeOpen,
  shouldRevealActiveActionRemove,
} from "./active-today-swipe.ts";
import {
  canOfferDaySummaryUndo,
  hasRestorableDayCloseSnapshot,
} from "./day-summary-undo.ts";

const actionId = "11111111-1111-4111-8111-111111111111";

test("active-action swipe stays compact and opens only past its threshold", () => {
  assert.equal(ACTIVE_ACTION_SWIPE_REVEAL_PX, 92);
  assert.equal(ACTIVE_ACTION_SWIPE_OPEN_THRESHOLD_PX, 52);
  assert.equal(shouldRevealActiveActionRemove(-51), false);
  assert.equal(shouldRevealActiveActionRemove(-52), true);
  assert.equal(resolveActiveActionSwipeOpen(0, -52), true);
});

test("an exposed action closes only after a deliberate right swipe", () => {
  assert.equal(ACTIVE_ACTION_SWIPE_CLOSE_THRESHOLD_PX, 40);
  assert.equal(resolveActiveActionSwipeOpen(-92, -53), true);
  assert.equal(resolveActiveActionSwipeOpen(-92, -52), false);
  assert.equal(resolveActiveActionSwipeOpen(-92, -92), true);
});

test("vertical scrolling with horizontal drift never becomes a row swipe", () => {
  assert.equal(resolveActiveActionSwipeIntent(3, 18), "vertical");
  assert.equal(resolveActiveActionSwipeIntent(-5, -24), "vertical");
  assert.equal(resolveActiveActionSwipeIntent(6, -30), "vertical");
  assert.equal(resolveActiveActionSwipeIntent(-20, 26), "vertical");
});

test("tiny movement waits while a deliberate left swipe locks horizontal", () => {
  assert.equal(resolveActiveActionSwipeIntent(-4, 5), "undecided");
  assert.equal(resolveActiveActionSwipeIntent(-12, 8), "undecided");
  assert.equal(resolveActiveActionSwipeIntent(-20, 4), "undecided");
  assert.equal(resolveActiveActionSwipeIntent(-24, 4), "horizontal");
});

test("current close snapshots remain eligible even when all actions completed", () => {
  assert.equal(
    hasRestorableDayCloseSnapshot({
      preCloseActions: [{ id: actionId, status: "completed" }],
    }),
    true,
  );
  assert.equal(
    hasRestorableDayCloseSnapshot({ preCloseActions: [] }),
    true,
  );
});

test("invalid or missing close snapshots are not offered for restoration", () => {
  assert.equal(hasRestorableDayCloseSnapshot({}), false);
  assert.equal(
    hasRestorableDayCloseSnapshot({
      preCloseActions: [{ id: actionId, status: "dropped" }],
    }),
    false,
  );
});

test("Undo close is offered only for an eligible same-day summary", () => {
  const snapshot = {
    preCloseActions: [{ id: actionId, status: "completed" }],
  };

  assert.equal(
    canOfferDaySummaryUndo({
      planStatus: "closed",
      planDate: "2026-08-04",
      currentLocalDate: "2026-08-04",
      snapshot,
    }),
    true,
  );
  assert.equal(
    canOfferDaySummaryUndo({
      planStatus: "closed",
      planDate: "2026-08-03",
      currentLocalDate: "2026-08-04",
      snapshot,
    }),
    false,
  );
});

test("added actions return to the workflow that owns their plan", () => {
  assert.equal(addedActionDestination("active"), "/today/active");
  assert.equal(addedActionDestination("proposed"), "/today/plan");
});

test("added Action acknowledgement explains timed and flexible interpretation", () => {
  assert.equal(formatAddedActionNotice(null), "Added as flexible");
  assert.equal(formatAddedActionNotice("18:15"), "Added for 6:15 pm");
  assert.equal(
    addedActionNoticeDestination("active", ""),
    "/today/active?notice=action-added",
  );
  assert.equal(
    addedActionNoticeDestination("proposed", "16:00"),
    "/today/plan?notice=action-added&time=16%3A00",
  );
});
