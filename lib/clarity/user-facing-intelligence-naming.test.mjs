import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const lifeView = read("../../components/clarity/life-model-view.tsx");
const askClarityPanel = read(
  "../../components/clarity/ask-clarity-panel.tsx",
);
const onboardingFlow = read(
  "../../components/clarity/onboarding-flow.tsx",
);
const bottomNavigation = read(
  "../../components/clarity/bottom-navigation.tsx",
);

test("user-facing intelligence is consistently named Clarity", () => {
  assert.match(lifeView, /Talk to Clarity/);
  assert.match(lifeView, /Tell Clarity what’s new/);
  assert.match(askClarityPanel, /Ask Clarity/);
  assert.match(askClarityPanel, /Continue with Clarity/);
  assert.match(
    onboardingFlow,
    /Tell Clarity/,
  );

  for (const source of [lifeView, askClarityPanel, onboardingFlow]) {
    assert.doesNotMatch(source, /Talk to Mentor|Continue in Mentor|Mentor is coming|Mentor-style|AI Assistant/);
  }
});

test("the primary intelligence destination is named Clarity", () => {
  assert.match(bottomNavigation, /label: "Today"/);
  assert.match(bottomNavigation, /label: "Calendar"/);
  assert.match(bottomNavigation, /label: "Clarity"/);
  assert.match(bottomNavigation, /label: "Life"/);
  assert.doesNotMatch(bottomNavigation, /label: "Mentor"/);
});
