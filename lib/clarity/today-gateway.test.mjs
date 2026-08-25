import assert from "node:assert/strict";
import test from "node:test";

import { resolveTodayGatewayPrimaryAction } from "./today-gateway.ts";

function resolve(overrides = {}) {
  return resolveTodayGatewayPrimaryAction({
    currentDay: "Monday",
    unresolvedApprovedDay: null,
    pendingReturnDayCount: null,
    planStatus: null,
    ...overrides,
  });
}

test("an unresolved approved previous day takes precedence", () => {
  assert.deepEqual(
    resolve({
      unresolvedApprovedDay: "Sunday",
      pendingReturnDayCount: 6,
      planStatus: "proposed",
    }),
    {
      kind: "link",
      label: "Finish Sunday",
      href: "/today/catch-up",
      heading: "Sunday needs a quick recap.",
      supportingText: "Capture what happened before moving into today.",
    },
  );
});

test("a six-day return uses the concise Catch Up copy", () => {
  assert.deepEqual(resolve({ pendingReturnDayCount: 6 }), {
    kind: "link",
    label: "Catch me up",
    href: "/today/catch-up/gap",
    heading: "Let's catch up",
    supportingText:
      "It's been 6 days. Take a minute to catch up before continuing with today.",
  });
});

test("a long return uses the same user-facing Catch Up language", () => {
  assert.deepEqual(resolve({ pendingReturnDayCount: 30 }), {
    kind: "link",
    label: "Catch me up",
    href: "/today/catch-up/gap",
    heading: "Let's catch up",
    supportingText:
      "It's been 30 days. Take a minute to catch up before continuing with today.",
  });
});

test("an unstarted current day uses the safe Start Day action", () => {
  assert.deepEqual(resolve(), {
    kind: "start",
    label: "Start Monday",
    heading: "Monday hasn't started yet.",
    supportingText: "Start when you're ready to shape the day.",
  });
});

test("an unshaped current plan uses the idempotent Start Day action", () => {
  assert.deepEqual(resolve({ planStatus: "unshaped" }), {
    kind: "start",
    label: "Start Monday",
    heading: "Monday hasn't started yet.",
    supportingText: "Start when you're ready to shape the day.",
  });
});

test("a proposed current plan continues shaping", () => {
  assert.deepEqual(resolve({ planStatus: "proposed" }), {
    kind: "link",
    label: "Continue shaping Monday",
    href: "/today/plan",
    heading: "Your Monday plan is ready.",
    supportingText: "Review the proposed actions before beginning.",
  });
});

test("an active current plan continues Active Today", () => {
  assert.deepEqual(resolve({ planStatus: "active" }), {
    kind: "link",
    label: "Continue Monday",
    href: "/today/active",
    heading: "Monday is underway.",
    supportingText: "Pick up where you left off with today's actions.",
  });
});

test("a closing current plan continues Close Day", () => {
  assert.deepEqual(resolve({ planStatus: "closing" }), {
    kind: "link",
    label: "Finish closing Monday",
    href: "/today/close",
    heading: "Ready to wrap up Monday?",
    supportingText: "Finish recording what happened today.",
  });
});

test("a closed current plan opens Day Summary", () => {
  assert.deepEqual(resolve({ planStatus: "closed" }), {
    kind: "link",
    label: "View Monday summary",
    href: "/today/summary",
    heading: "Monday is complete.",
    supportingText: "Review what was completed and what changed.",
  });
});
