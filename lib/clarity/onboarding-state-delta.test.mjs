import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  composeOnboardingTurnResponse,
  mergeOnboardingDiscoveryState,
  onboardingCanonicalStateForModel,
  onboardingDiscoveryResponseJsonSchema,
  onboardingDiscoveryResponseSchema,
  onboardingFinalSynthesisResponseSchema,
} from "./onboarding-state-delta.ts";

const firstMessageId = "11111111-1111-4111-8111-111111111111";
const secondMessageId = "22222222-2222-4222-8222-222222222222";
const allowedMessageIds = new Set([firstMessageId, secondMessageId]);

const state = {
  understanding: {
    currentReality: [
      {
        statement: "The user reports losing their job last month.",
        truthState: "fact",
        confidence: "high",
        evidenceMessageIds: [firstMessageId],
      },
    ],
    desiredFuture: [],
    capabilitiesAndAssets: [],
    constraints: [],
    behavioralEvidence: [],
    currentPriorityOrPressure: [
      {
        statement: "Income is probably the immediate priority.",
        truthState: "inference",
        confidence: "medium",
        evidenceMessageIds: [firstMessageId],
      },
    ],
    possibleRoutes: [],
  },
  progress: {
    situation: "getting_clearer",
    whatMatters: "learning",
    future: "learning",
    constraints: "getting_clearer",
    readyForConfirmation: false,
  },
  unknowns: [
    {
      statement: "How urgent the income pressure is remains unknown.",
      materiality: "high",
    },
  ],
  insights: [
    {
      statement: "The immediate constraint may matter more than distant direction.",
      confidence: "medium",
      evidenceMessageIds: [firstMessageId],
    },
  ],
  routes: [],
  synthesis: null,
};

function discovery(overrides = {}) {
  const stateDelta = overrides.stateDelta ?? {};
  return onboardingDiscoveryResponseSchema.parse({
    assistantMessage: "Income pressure looks like the useful thing to clarify next.",
    mode: "CLARIFY",
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
      ...stateDelta,
    },
    progressDelta: {
      situation: null,
      whatMatters: null,
      future: null,
      constraints: null,
      ...overrides.progressDelta,
    },
    readiness: {
      understandingReady: false,
      actionReady: false,
      readyToSynthesize: false,
      reason: "Income urgency is still material.",
      ...overrides.readiness,
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => !["stateDelta", "progressDelta", "readiness"].includes(key),
      ),
    ),
  });
}

test("discovery output is delta-only rather than a regenerated person model", () => {
  assert.deepEqual(
    Object.keys(onboardingDiscoveryResponseJsonSchema.properties),
    ["assistantMessage", "mode", "stateDelta", "progressDelta", "readiness"],
  );
  assert.equal("understanding" in onboardingDiscoveryResponseJsonSchema.properties, false);
  assert.equal("synthesis" in onboardingDiscoveryResponseJsonSchema.properties, false);
  assert.equal("horizons" in onboardingDiscoveryResponseJsonSchema.properties, false);
  assert.throws(() =>
    onboardingDiscoveryResponseSchema.parse({
      ...discovery(),
      understanding: state.understanding,
    }),
  );
});

test("server merge preserves untouched claims and adds a grounded fact", () => {
  const output = mergeOnboardingDiscoveryState({
    state,
    discovery: discovery({
      stateDelta: {
        claimsToAdd: [
          {
            category: "constraints",
            statement: "The user reports having three months of savings.",
            truthState: "fact",
            confidence: "high",
            evidenceMessageIds: [secondMessageId],
          },
        ],
      },
    }),
    allowedMessageIds,
  });

  assert.deepEqual(output.understanding.currentReality, state.understanding.currentReality);
  assert.equal(output.understanding.constraints.length, 1);
  assert.equal(
    output.understanding.constraints[0].statement,
    "The user reports having three months of savings.",
  );
});

test("a server-issued claim identity updates an inference without replacing other state", () => {
  const identified = onboardingCanonicalStateForModel(state);
  const priority = identified.claims.find(
    (claim) => claim.category === "currentPriorityOrPressure",
  );
  assert.ok(priority);

  const output = mergeOnboardingDiscoveryState({
    state,
    discovery: discovery({
      stateDelta: {
        claimsToUpdate: [
          {
            claimId: priority.claimId,
            statement: "Replacing income is the immediate priority.",
            truthState: "fact",
            confidence: "high",
            evidenceMessageIds: [firstMessageId, secondMessageId],
          },
        ],
      },
    }),
    allowedMessageIds,
  });

  assert.deepEqual(output.understanding.currentReality, state.understanding.currentReality);
  assert.deepEqual(output.understanding.currentPriorityOrPressure[0], {
    statement: "Replacing income is the immediate priority.",
    truthState: "fact",
    confidence: "high",
    evidenceMessageIds: [firstMessageId, secondMessageId],
  });
});

test("an unknown can be resolved only through its current server-issued identity", () => {
  const unknownId = onboardingCanonicalStateForModel(state).unknowns[0].unknownId;
  const output = mergeOnboardingDiscoveryState({
    state,
    discovery: discovery({
      stateDelta: { unknownIdsToResolve: [unknownId] },
    }),
    allowedMessageIds,
  });
  assert.deepEqual(output.unknowns, []);

  assert.throws(
    () =>
      mergeOnboardingDiscoveryState({
        state,
        discovery: discovery({
          stateDelta: {
            unknownIdsToResolve: ["unknown_00000000000000000000"],
          },
        }),
        allowedMessageIds,
      }),
    /Unknown onboarding unknown ID/,
  );
});

test("delta evidence must reference a real authored onboarding message", () => {
  assert.throws(
    () =>
      mergeOnboardingDiscoveryState({
        state,
        discovery: discovery({
          stateDelta: {
            claimsToAdd: [
              {
                category: "behavioralEvidence",
                statement: "The user reports having paying customers.",
                truthState: "fact",
                confidence: "high",
                evidenceMessageIds: ["33333333-3333-4333-8333-333333333333"],
              },
            ],
          },
        }),
        allowedMessageIds,
      }),
    /unknown user message/,
  );
});

test("readiness and progress can advance without generating synthesis", () => {
  const nextDiscovery = discovery({
    progressDelta: { situation: "clear", whatMatters: "getting_clearer" },
    readiness: { understandingReady: true, actionReady: false },
  });
  const merged = mergeOnboardingDiscoveryState({
    state,
    discovery: nextDiscovery,
    allowedMessageIds,
  });
  const output = composeOnboardingTurnResponse({
    discovery: nextDiscovery,
    state: merged,
    synthesis: null,
    allowedMessageIds,
  });

  assert.equal(output.progress.situation, "clear");
  assert.equal(output.progress.whatMatters, "getting_clearer");
  assert.equal(output.readiness.readyForSynthesis, false);
  assert.equal(output.synthesis, null);
});

test("ready discovery requires a dedicated final synthesis built from merged state", () => {
  const readyDiscovery = discovery({
    stateDelta: {
      claimsToAdd: [
        {
          category: "capabilitiesAndAssets",
          statement: "The user reports already having two paying clients.",
          truthState: "fact",
          confidence: "high",
          evidenceMessageIds: [secondMessageId],
        },
      ],
    },
    progressDelta: {
      situation: "clear",
      whatMatters: "clear",
      constraints: "clear",
    },
    readiness: {
      understandingReady: true,
      actionReady: true,
      readyToSynthesize: true,
      reason: "The current position and first move are clear.",
    },
  });
  const merged = mergeOnboardingDiscoveryState({
    state,
    discovery: readyDiscovery,
    allowedMessageIds,
  });
  assert.throws(
    () =>
      composeOnboardingTurnResponse({
        discovery: readyDiscovery,
        state: merged,
        synthesis: null,
        allowedMessageIds,
      }),
    /Final synthesis must match validated onboarding readiness/,
  );

  const final = onboardingFinalSynthesisResponseSchema.parse({
    assistantMessage: "Here’s the useful picture. Is anything important wrong or missing?",
    synthesis: {
      whereYouAre: "Income needs replacing after a recent job loss.",
      whatYouWant: "More control over work and income.",
      whatYouHaveGoingForYou: "Two paying clients provide demonstrated demand.",
      whatCouldGetInTheWay: "Available runway is finite.",
      stillUnsure: "The repeatability of client demand remains unknown.",
      whatMattersFirst: "Replace income without abandoning the strongest evidence.",
      horizons: {
        longTerm: "Build greater autonomy over work.",
        midTerm: "Establish dependable independent income.",
        shortTerm: "Test repeatable demand while protecting runway.",
        bottleneck: "Reliable near-term income.",
        nextMove: "Ask the two current clients for one qualified referral each.",
      },
    },
  });
  const output = composeOnboardingTurnResponse({
    discovery: readyDiscovery,
    state: merged,
    synthesis: final,
    allowedMessageIds,
  });

  assert.equal(output.mode, "SYNTHESIZE");
  assert.equal(
    output.understanding.capabilitiesAndAssets[0].statement,
    "The user reports already having two paying clients.",
  );
  assert.equal(
    output.synthesis.horizons.nextMove,
    "Ask the two current clients for one qualified referral each.",
  );
});

test("repeated merges do not duplicate claims and unchanged identities are deterministic", () => {
  const addition = {
    category: "constraints",
    statement: "The user reports having three months of savings.",
    truthState: "fact",
    confidence: "high",
    evidenceMessageIds: [secondMessageId],
  };
  const delta = discovery({ stateDelta: { claimsToAdd: [addition] } });
  const once = mergeOnboardingDiscoveryState({
    state,
    discovery: delta,
    allowedMessageIds,
  });
  const twice = mergeOnboardingDiscoveryState({
    state: once,
    discovery: delta,
    allowedMessageIds,
  });

  assert.equal(twice.understanding.constraints.length, 1);
  assert.deepEqual(
    onboardingCanonicalStateForModel(once),
    onboardingCanonicalStateForModel(twice),
  );
});

test("the orchestrator calls final synthesis only behind validated discovery readiness", () => {
  const orchestrator = readFileSync(
    new URL("./onboarding-orchestrator.ts", import.meta.url),
    "utf8",
  );
  const readinessBranch = orchestrator.indexOf(
    "if (discoveryResult.output.readiness.readyToSynthesize)",
  );
  const synthesisCall = orchestrator.indexOf(
    "clarity_onboarding_final_synthesis",
    readinessBranch,
  );
  const composedResponse = orchestrator.indexOf(
    "composeOnboardingTurnResponse",
    synthesisCall,
  );

  assert.ok(readinessBranch >= 0);
  assert.ok(synthesisCall > readinessBranch);
  assert.ok(composedResponse > synthesisCall);
  assert.match(orchestrator, /buildOnboardingSynthesisUserPrompt\(\{\s*state: mergedState/);
  assert.match(orchestrator, /name: "clarity_onboarding_discovery_delta"/);
});
