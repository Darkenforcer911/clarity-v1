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
    "Take the next useful step",
    "Prefer progress over busyness",
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
  assert.match(CLARITY_REASONING_POLICY, /Speak in plain English/);
  assert.match(CLARITY_REASONING_POLICY, /not a consultant/);
  assert.match(CLARITY_REASONING_POLICY, /slightly more composed/);
  assert.match(CLARITY_REASONING_POLICY, /Never turn style matching into a caricature/);
  assert.match(CLARITY_REASONING_POLICY, /Do not become agreeable/);
  assert.match(CLARITY_REASONING_POLICY, /reasoning quality and truth discipline do not/);
  assert.doesNotMatch(CLARITY_REASONING_POLICY, /highest-leverage|next rung/);
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
