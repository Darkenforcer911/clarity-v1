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

test("runtime policy does not manufacture domain state from example phrases", () => {
  const state = seedUserIntroducedUnknowns({
    state: emptyState,
    latestUserMessage:
      "I lost my job a couple months ago and I'm trying to sort my shit out. I've got a few other things going on too.",
  });

  assert.equal(state, emptyState);
  assert.deepEqual(state.unknowns, []);
});

test("an incomplete current-world model blocks premature future focus without phrase matching", () => {
  const policy = buildOnboardingQuestionPolicy({
    state: emptyState,
    messages: [
      {
        role: "user",
        content: "There are a few important things I need to sort out.",
      },
    ],
    previousFocus: null,
  });

  assert.equal(policy.broadFutureAllowed, false);
  assert.ok(policy.allowedDomains.includes("OTHER"));
  assert.equal(policy.allowedDomains.includes("FUTURE_PULL"), false);
  assert.deepEqual(policy.preferredTargets, []);
});

test("unfamiliar branches remain first-class current-world targets", () => {
  const state = {
    ...emptyState,
    unknowns: [
      {
        statement:
          "The role of the residency appeal in the user's current priorities remains unresolved.",
        materiality: "high",
      },
    ],
  };
  const messages = [
    {
      role: "user",
      content: "I also have a residency appeal in progress.",
    },
  ];
  const policy = buildOnboardingQuestionPolicy({
    state,
    messages,
    previousFocus: null,
  });

  assert.equal(policy.broadFutureAllowed, false);
  assert.ok(policy.allowedDomains.includes("OTHER"));
  assert.equal(policy.preferredTargets[0]?.domain, "OTHER");
  assert.match(policy.preferredTargets[0]?.target ?? "", /residency appeal/i);
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
          assistantMessage:
            "What would you want the residency appeal to make possible a year from now?",
          questionFocus: {
            domain: "OTHER",
            target: "the user's residency appeal",
            reason: "The desired future is unclear.",
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
        assistantMessage: "What stage is the residency appeal at now?",
        questionFocus: {
          domain: "OTHER",
          target:
            "The role of the residency appeal in the user's current priorities remains unresolved.",
          reason: "Its timing may change the immediate priority.",
          relatedUnknownId: policy.preferredTargets[0].relatedUnknownId,
        },
      }),
    }),
  );
});

test("a newly introduced branch does not require a hard-coded flow", () => {
  const state = {
    ...emptyState,
    unknowns: [
      {
        statement: "The current work direction remains unresolved.",
        materiality: "high",
      },
    ],
  };
  const policy = buildOnboardingQuestionPolicy({
    state,
    messages: [
      { role: "user", content: "I also have a residency appeal in progress." },
    ],
    previousFocus: null,
  });

  assert.equal(policy.preferredTargets[0]?.domain, "CURRENT_WORK");
  assert.ok(policy.allowedDomains.includes("CURRENT_WORK"));
  assert.ok(policy.allowedDomains.includes("OTHER"));
  assert.equal(policy.allowedDomains.includes("FUTURE_PULL"), false);
  assert.doesNotThrow(() =>
    validateOnboardingQuestionSelection({
      state,
      policy,
      discovery: discovery({
        assistantMessage: "What stage is the residency appeal at now?",
        questionFocus: {
          domain: "OTHER",
          target: "the user's residency appeal",
          reason: "The newly introduced branch may change the priority.",
          relatedUnknownId: null,
        },
      }),
    }),
  );
});

test("future focus remains available after the current world is clear", () => {
  const state = {
    ...emptyState,
    progress: { ...emptyState.progress, situation: "clear" },
    unknowns: [
      {
        statement: "The life the user wants a year from now remains unresolved.",
        materiality: "high",
      },
    ],
  };
  const policy = buildOnboardingQuestionPolicy({
    state,
    messages: [{ role: "user", content: "That's the main picture right now." }],
    previousFocus: null,
  });

  assert.equal(policy.broadFutureAllowed, true);
  assert.deepEqual(policy.allowedDomains, ["FUTURE_PULL"]);
  assert.equal(policy.preferredTargets[0]?.domain, "FUTURE_PULL");
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
  const introduced = {
    ...emptyState,
    unknowns: [
      {
        statement: "The current stage of the active project remains unresolved.",
        materiality: "high",
      },
    ],
  };
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
        content: "I have an active project as well.",
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
        assistantMessage: "What stage is the active project at now?",
        questionFocus: {
          domain: "ACTIVE_PROJECTS",
          target: "The current stage of the active project remains unresolved.",
          reason: "Its stage may change the immediate priority.",
          relatedUnknownId: policy.preferredTargets[0].relatedUnknownId,
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
  const state = emptyState;
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
