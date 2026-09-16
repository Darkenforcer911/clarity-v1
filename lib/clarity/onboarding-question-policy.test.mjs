import assert from "node:assert/strict";
import test from "node:test";

import {
  areQuestionsMateriallySame,
  buildOnboardingQuestionPolicy,
  isOnboardingNonAnswer,
  seedUserIntroducedUnknowns,
  validateOnboardingQuestionSelection,
} from "./onboarding-question-policy.ts";
import { onboardingDiscoveryResponseSchema } from "./onboarding-state-delta.ts";

const emptyState = {
  understanding: {
    currentReality: [],
    desiredFuture: [],
    capabilitiesAndAssets: [],
    constraints: [],
    behavioralEvidence: [],
    currentPriorityOrPressure: [],
    possibleRoutes: [],
  },
  progress: {
    situation: "learning",
    whatMatters: "learning",
    future: "learning",
    constraints: "learning",
    readyForConfirmation: false,
  },
  unknowns: [],
  insights: [],
  routes: [],
  synthesis: null,
};

function discovery({ assistantMessage, questionFocus }) {
  return onboardingDiscoveryResponseSchema.parse({
    assistantMessage,
    mode: "CLARIFY",
    questionFocus,
    evidenceRequest: null,
    stateDelta: {
      claimsToAdd: [],
      claimsToUpdate: [],
      claimIdsToRemove: [],
      unknownsToAdd: [],
      unknownsToUpdate: [],
      unknownIdsToResolve: [],
      insightsToAdd: [],
      insightsToUpdate: [],
      insightIdsToRemove: [],
      routesToAdd: [],
      routesToUpdate: [],
      routeIdsToRemove: [],
    },
    progressDelta: {
      situation: null,
      whatMatters: null,
      future: null,
      constraints: null,
    },
    readiness: {
      personReady: false,
      actionReady: false,
      readyToSynthesize: false,
      reason: "Important current-world branches remain unresolved.",
    },
  });
}

test("job loss and vague other activity become durable current-world unknowns", () => {
  const state = seedUserIntroducedUnknowns({
    state: emptyState,
    latestUserMessage:
      "I lost my job a couple months ago and I'm trying to sort my shit out. I've got a few other things going on too.",
  });

  assert.equal(state.unknowns.length, 3);
  assert.ok(state.unknowns.some((item) => /previous role/i.test(item.statement)));
  assert.ok(state.unknowns.some((item) => /replacement income/i.test(item.statement)));
  assert.ok(state.unknowns.some((item) => /other projects/i.test(item.statement)));
});

test("current-world branches block generic future focus without imposing a questionnaire", () => {
  const state = seedUserIntroducedUnknowns({
    state: emptyState,
    latestUserMessage:
      "I lost my job a couple months ago and I've got a few other things going on.",
  });
  const messages = [
    {
      role: "user",
      content:
        "I lost my job a couple months ago and I've got a few other things going on.",
    },
  ];
  const policy = buildOnboardingQuestionPolicy({
    state,
    messages,
    previousFocus: null,
  });

  assert.equal(policy.broadFutureAllowed, false);
  assert.ok(policy.allowedDomains.includes("CURRENT_WORK"));
  assert.ok(policy.allowedDomains.includes("ECONOMIC_PRESSURE"));
  assert.ok(policy.allowedDomains.includes("ACTIVE_PROJECTS"));
  assert.equal(policy.allowedDomains.includes("FUTURE_PULL"), false);

  assert.throws(
    () =>
      validateOnboardingQuestionSelection({
        state,
        policy,
        discovery: discovery({
          assistantMessage: "What would you most want to be different a year from now?",
          questionFocus: {
            domain: "FUTURE_PULL",
            target: "the user's desired life a year from now",
            reason: "The future is not clear.",
            relatedUnknownId: null,
          },
        }),
      }),
    /not currently allowed/,
  );

  assert.throws(
    () =>
      validateOnboardingQuestionSelection({
        state,
        policy,
        discovery: discovery({
          assistantMessage: "What kind of work would you want a year from now?",
          questionFocus: {
            domain: "CURRENT_WORK",
            target: "the user's future work",
            reason: "Their preferred work is unclear.",
            relatedUnknownId: null,
          },
        }),
      }),
    /broad future question is unavailable/i,
  );

  assert.doesNotThrow(() =>
    validateOnboardingQuestionSelection({
      state,
      policy,
      discovery: discovery({
        assistantMessage: "What were you doing for work before you lost the job?",
        questionFocus: {
          domain: "CURRENT_WORK",
          target: "the user's previous work",
          reason: "Their experience changes the realistic next routes.",
          relatedUnknownId: null,
        },
      }),
    }),
  );
});

test("short non-answers are recognized without classifying substantive uncertainty as empty", () => {
  for (const value of [
    "idk",
    "I don't know",
    "Not sure.",
    "No idea",
    "I haven't thought about it",
  ]) {
    assert.equal(isOnboardingNonAnswer(value), true, value);
  }
  assert.equal(
    isOnboardingNonAnswer(
      "I'm not sure yet, but income and the project both matter to me.",
    ),
    false,
  );
});

test("a non-answer forces a concrete pivot and blocks the prior future focus", () => {
  const introduced = seedUserIntroducedUnknowns({
    state: emptyState,
    latestUserMessage:
      "I lost my job a couple months ago and I've got a few other things going on.",
  });
  const previousFocus = {
    domain: "FUTURE_PULL",
    target: "what the user wants to be different a year from now",
    reason: "The future is unknown.",
    relatedUnknownId: null,
  };
  const state = seedUserIntroducedUnknowns({
    state: introduced,
    latestUserMessage: "Idk",
    previousFocus,
  });
  const policy = buildOnboardingQuestionPolicy({
    state,
    previousFocus,
    messages: [
      {
        role: "user",
        content:
          "I lost my job a couple months ago and I've got a few other things going on.",
      },
      {
        role: "clarity",
        content: "What would you most want to be different a year from now?",
      },
      { role: "user", content: "Idk" },
    ],
  });

  assert.equal(policy.latestUserResponseWasNonAnswer, true);
  assert.equal(policy.mustPivotFromPreviousFocus, true);
  assert.equal(policy.allowedDomains.includes("FUTURE_PULL"), false);
  assert.ok(state.unknowns.some((item) => /cannot currently answer/i.test(item.statement)));

  assert.doesNotThrow(() =>
    validateOnboardingQuestionSelection({
      state,
      policy,
      discovery: discovery({
        assistantMessage: "What are the other things you currently have going on?",
        questionFocus: {
          domain: "ACTIVE_PROJECTS",
          target: "the other things the user currently has going on",
          reason: "Those activities may change the immediate priority.",
          relatedUnknownId: null,
        },
      }),
    }),
  );
});

test("semantic repetition catches the observed question and a trivial rephrase", () => {
  assert.equal(
    areQuestionsMateriallySame(
      "What would you most want to be different a year from now?",
      "What would you like to change in the next year?",
    ),
    true,
  );
  assert.equal(
    areQuestionsMateriallySame(
      "What would you most want to be different a year from now?",
      "What were you doing for work before you lost the job?",
    ),
    false,
  );
});

test("declared focus must match the visible question and a current unknown identity", () => {
  const state = seedUserIntroducedUnknowns({
    state: emptyState,
    latestUserMessage: "I lost my job recently.",
  });
  const policy = buildOnboardingQuestionPolicy({
    state,
    messages: [{ role: "user", content: "I lost my job recently." }],
    previousFocus: null,
  });

  assert.throws(
    () =>
      validateOnboardingQuestionSelection({
        state,
        policy,
        discovery: discovery({
          assistantMessage: "What were you doing for work before you lost the job?",
          questionFocus: {
            domain: "CURRENT_WORK",
            target: "the user's previous work",
            reason: "It changes the available routes.",
            relatedUnknownId: "unknown_00000000000000000000",
          },
        }),
      }),
    /unknown focus target/,
  );

  assert.throws(
    () =>
      validateOnboardingQuestionSelection({
        state,
        policy,
        discovery: discovery({
          assistantMessage: "What were you doing for work before you lost the job?",
          questionFocus: {
            domain: "ECONOMIC_PRESSURE",
            target: "the urgency of replacement income",
            reason: "It changes the immediate priority.",
            relatedUnknownId: null,
          },
        }),
      }),
    /does not match its declared focus/,
  );
});
