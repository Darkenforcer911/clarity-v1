import assert from "node:assert/strict";
import test from "node:test";

import {
  CLARITY_ONBOARDING_REASONING_SEQUENCE,
  CLARITY_REASONING_LOOP,
  CLARITY_REASONING_POLICY,
} from "./reasoning-policy.ts";

test("shared reasoning policy encodes Clarity's grounded agency principles", () => {
  for (const principle of [
    "Constructive agency",
    "Reality first",
    "Expand the option set",
    "Find the next rung",
    "Prefer leverage over busyness",
    "Evidence matters",
    "Forward-moving without fake hustle",
    "Tone",
    "Adaptive onboarding",
  ]) {
    assert.match(CLARITY_REASONING_POLICY, new RegExp(principle));
  }

  assert.match(
    CLARITY_REASONING_POLICY,
    /Unconfirmed interpretation is never canonical/,
  );
  assert.match(CLARITY_REASONING_POLICY, /single most useful follow-up question/);
  assert.match(CLARITY_REASONING_POLICY, /Do not force a fixed questionnaire/);
});

test("onboarding uses the current position-to-next-move philosophy", () => {
  assert.deepEqual(CLARITY_ONBOARDING_REASONING_SEQUENCE, [
    "Position",
    "Possibilities",
    "Direction",
    "Next move",
  ]);
});

test("shared reasoning loop complements the Life Model without changing it", () => {
  assert.deepEqual(CLARITY_REASONING_LOOP, [
    "Reality",
    "Possibilities",
    "Direction",
    "Action",
    "Evidence",
    "Adaptation",
    "Better possibilities",
  ]);
});
