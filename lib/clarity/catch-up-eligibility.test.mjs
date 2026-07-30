import assert from "node:assert/strict";
import test from "node:test";

import {
  developmentRecapActions,
  expectedRecapActionIds,
} from "./catch-up-eligibility.fixtures.ts";
import { isCatchUpEligibleAction } from "./catch-up-eligibility.ts";

test("Recap renders and submits only actions present at rollover", () => {
  const submittedActionIds = developmentRecapActions
    .filter(isCatchUpEligibleAction)
    .map((action) => action.id);

  assert.deepEqual(submittedActionIds, expectedRecapActionIds);
  assert.equal(submittedActionIds.includes("removed-from-today"), false);
  assert.equal(submittedActionIds.includes("replaced-original"), false);
  assert.equal(
    submittedActionIds.includes("replacement-that-remained"),
    true,
  );
});
