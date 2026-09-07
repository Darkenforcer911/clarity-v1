import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { clarityInvocationSurfaces } from "./ai/clarity-context.ts";
import { clarityMemoryKinds } from "./ai/clarity-memory.ts";
import {
  clarityConfirmationRequiredMutationKinds,
  clarityNextMoveTypes,
} from "./ai/clarity-orchestrator.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const navigation = read("../../components/clarity/bottom-navigation.tsx");
const page = read("../../app/(app)/clarity/page.tsx");
const context = read("./ai/clarity-context.ts");
const memory = read("./ai/clarity-memory.ts");
const orchestrator = read("./ai/clarity-orchestrator.ts");
const opportunity = read("./ai/opportunity-analysis.ts");
const architecture = read("../../docs/clarity-intelligence-v1.md");

test("bottom navigation exposes Today, Calendar, Clarity, and Life in order", () => {
  const todayAt = navigation.indexOf('{ href: "/today"');
  const calendarAt = navigation.indexOf('{ href: "/calendar"');
  const clarityAt = navigation.indexOf('{ href: "/clarity"');
  const lifeAt = navigation.indexOf('{ href: "/life-model"');

  assert.ok(todayAt >= 0);
  assert.ok(calendarAt > todayAt);
  assert.ok(clarityAt > calendarAt);
  assert.ok(lifeAt > clarityAt);
  assert.match(navigation, /href: "\/clarity", label: "Clarity", icon: Compass/);
  assert.match(navigation, /grid grid-cols-4 gap-1/);
  assert.match(navigation, /min-h-12 min-w-0/);
  assert.match(navigation, /prefetch=\{false\}/);
  assert.doesNotMatch(
    navigation,
    /\bMessageCircle\b|\bSparkles\b|\bBot\b|\bWand\b/,
  );
});

test("the Clarity route hosts one real persistent conversation", () => {
  assert.match(page, /data-slot="clarity-conversation"/);
  assert.match(page, />\s*Clarity\s*</);
  assert.match(
    page,
    /Think through what matters, explore your options, and work out what[\s\S]*to do next\./,
  );
  assert.match(page, /loadClarityConversation/);
  assert.match(page, /<ClarityConversation/);
  assert.doesNotMatch(page, /New chat|OpenAI|Anthropic|Gemini/);
});

test("one orchestrator exposes the complete internal next-move vocabulary", () => {
  assert.deepEqual(clarityNextMoveTypes, [
    "ask",
    "clarify",
    "research",
    "explore",
    "recommend",
    "propose_action",
    "propose_life_change",
    "synthesize",
    "confirm",
  ]);
  assert.match(orchestrator, /interface ClarityOrchestrator/);
  assert.match(orchestrator, /typeof CLARITY_REASONING_POLICY/);
  assert.match(orchestrator, /decideNextMove/);
  assert.doesNotMatch(orchestrator, /openai|anthropic|gemini|generateText/i);
});

test("context contracts reuse canonical Life, Daily Loop, Calendar, and Return models", () => {
  assert.match(context, /LifeModel/);
  assert.match(context, /DailyLoopData/);
  assert.match(context, /CalendarCommitment/);
  assert.match(context, /DayCorrection/);
  assert.match(context, /AuthoritativeReturnState/);
  assert.match(context, /ReturnGapRecord/);
  assert.match(context, /ClarityMemorySource/);
  assert.match(context, /ClarityVerifiedExternalContext/);
  assert.match(context, /consequential: boolean/);
});

test("all planned product surfaces share the same future Clarity entry contract", () => {
  assert.deepEqual(clarityInvocationSurfaces, [
    "clarity",
    "onboarding",
    "shape_today",
    "catch_up",
    "life_change",
    "weekly_review",
    "action_workspace",
  ]);
});

test("the orchestrator can receive one selected canonical subject", () => {
  assert.match(context, /ClarityActionInvocation/);
  assert.match(orchestrator, /subject\?: ClarityInvocationSubject/);
});

test("memory distinguishes raw user statements from canonical or verified truth", () => {
  assert.deepEqual(clarityMemoryKinds, [
    "raw_conversation",
    "recent_working_context",
    "episode",
    "canonical_life",
    "strategic_decision",
    "evidence_outcome",
    "compressed_summary",
  ]);
  assert.match(memory, /"user_reported"/);
  assert.match(memory, /"confirmed_canonical"/);
  assert.match(memory, /"system_observed"/);
  assert.match(memory, /"externally_verified"/);
  assert.match(memory, /One append-only, user-visible conversation/);
  assert.doesNotMatch(memory, /userId:/);
});

test("opportunity and forecast contracts stay qualitative and evidence-aware", () => {
  for (const field of [
    "upside",
    "evidence",
    "downsideRisk",
    "reversibility",
    "cost",
    "timeToEvidence",
    "desiredLifeFit",
    "constraints",
    "optionValue",
    "confidence",
  ]) {
    assert.match(opportunity, new RegExp(`${field}:`));
  }
  assert.match(opportunity, /likelyCase:/);
  assert.match(opportunity, /upsideCase:/);
  assert.match(opportunity, /downsideCase:/);
  assert.match(opportunity, /keyAssumptions:/);
  assert.match(opportunity, /evidenceThatWouldChangeForecast:/);
  assert.doesNotMatch(opportunity, /probability|percentage|chanceOfSuccess/i);
});

test("consequential mutations remain proposals requiring confirmation", () => {
  assert.deepEqual(clarityConfirmationRequiredMutationKinds, [
    "action",
    "life_model",
    "current_direction",
    "calendar_commitment",
  ]);
  assert.match(orchestrator, /requiresUserConfirmation: true/);
  assert.match(orchestrator, /BuiltMentorLifeProposal/);
  assert.doesNotMatch(orchestrator, /userId:/);
  assert.doesNotMatch(orchestrator, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test("architecture persists one owned conversation and prohibits cross-user raw context", () => {
  assert.match(architecture, /one conversation per user/i);
  assert.match(architecture, /append-only user-visible messages/);
  assert.match(architecture, /must never be exposed as[\s\S]*another user/);
  assert.match(architecture, /no[\s\S]*global-learning table/);
  assert.match(architecture, /bounded two-stage path/i);
  assert.match(architecture, /Canonical mutation tools remain unavailable/);
  assert.match(architecture, /Application code validates and enforces/);
});
