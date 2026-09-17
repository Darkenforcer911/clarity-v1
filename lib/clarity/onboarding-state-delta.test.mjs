import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ClarityStructuredValidationError } from "./ai/clarity-structured-diagnostics.ts";

import {
  composeOnboardingTurnResponse,
  mergeOnboardingDiscoveryState,
  onboardingCanonicalStateForModel,
  onboardingDiscoveryResponseJsonSchema,
  onboardingDiscoveryResponseSchema,
  onboardingFinalSynthesisResponseSchema,
  validateOnboardingReadiness,
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
    assistantMessage:
      "Income pressure looks like the useful thing to clarify next. How urgent is replacing it?",
    mode: "CLARIFY",
    questionFocus: {
      domain: "ECONOMIC_PRESSURE",
      target: "the urgency of replacing income",
      reason: "It could change the immediate priority.",
      relatedUnknownId: null,
    },
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
      personReady: false,
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

function stateWithInsightCount(count) {
  return {
    ...state,
    insights: Array.from({ length: count }, (_, index) => ({
      statement: `Observed decision-relevant pattern ${index + 1}.`,
      confidence: "medium",
      evidenceMessageIds: [firstMessageId],
    })),
  };
}

test("discovery output is delta-only rather than a regenerated person model", () => {
  assert.deepEqual(
    Object.keys(onboardingDiscoveryResponseJsonSchema.properties),
    [
      "assistantMessage",
      "mode",
      "questionFocus",
      "evidenceRequest",
      "stateDelta",
      "progressDelta",
      "readiness",
    ],
  );
  assert.equal("understanding" in onboardingDiscoveryResponseJsonSchema.properties, false);
  assert.equal("synthesis" in onboardingDiscoveryResponseJsonSchema.properties, false);
  assert.equal("horizons" in onboardingDiscoveryResponseJsonSchema.properties, false);
  assert.equal(
    onboardingDiscoveryResponseJsonSchema.properties.assistantMessage.maxLength,
    700,
  );
  assert.deepEqual(
    onboardingDiscoveryResponseJsonSchema.properties.readiness.required,
    ["personReady", "actionReady", "readyToSynthesize", "reason"],
  );
  assert.throws(() =>
    onboardingDiscoveryResponseSchema.parse({
      ...discovery(),
      understanding: state.understanding,
    }),
  );
});

test("evidence requests are optional, bounded, and only medium or high relevance", () => {
  const requested = discovery({
    assistantMessage:
      "How close is the app to being in users’ hands? If it’s easier, you can send one screenshot of the current product so I can see its stage.",
    evidenceRequest: {
      what: "One screenshot of the current app product",
      why: "It would help distinguish product completion from launch or validation work.",
      decisionRelevance: "high",
      optional: true,
    },
  });

  assert.equal(requested.evidenceRequest?.optional, true);
  assert.equal(requested.evidenceRequest?.decisionRelevance, "high");
  const persisted = composeOnboardingTurnResponse({
    discovery: requested,
    state,
    synthesis: null,
    allowedMessageIds,
  });
  assert.deepEqual(persisted.evidenceRequest, requested.evidenceRequest);
  assert.throws(() =>
    discovery({
      evidenceRequest: {
        what: "A screenshot",
        why: "It might be interesting.",
        decisionRelevance: "low",
        optional: true,
      },
    }),
  );
  assert.throws(() =>
    discovery({
      evidenceRequest: {
        what: "A screenshot",
        why: "It would clarify product stage.",
        decisionRelevance: "high",
        optional: false,
      },
    }),
  );
});

test("synthesis-ready turns cannot request more visual evidence", () => {
  assert.throws(
    () =>
      discovery({
        questionFocus: null,
        evidenceRequest: {
          what: "A current product screen",
          why: "It would clarify product stage.",
          decisionRelevance: "high",
          optional: true,
        },
        readiness: {
          personReady: true,
          actionReady: true,
          readyToSynthesize: true,
        },
      }),
    /must not request more evidence/,
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

test("invalid delta updates/removals retain state-delta diagnostics", () => {
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
    (error) => {
      assert.ok(error instanceof ClarityStructuredValidationError);
      assert.equal(error.stage, "state_delta");
      assert.equal(error.code, "unknown_canonical_id");
      assert.equal(error.safeMetadata.operationType, "unknown_resolve");
      assert.equal(
        error.safeMetadata.canonicalId,
        "unknown_00000000000000000000",
      );
      return true;
    },
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

test("invalid evidence references retain evidence-stage diagnostics", () => {
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
                evidenceMessageIds: [
                  "33333333-3333-4333-8333-333333333333",
                ],
              },
            ],
          },
        }),
        allowedMessageIds,
      }),
    (error) => {
      assert.ok(error instanceof ClarityStructuredValidationError);
      assert.equal(error.stage, "evidence_reference");
      assert.equal(error.code, "unknown_user_message_reference");
      assert.equal(error.safeMetadata.operationType, "claim_add");
      return true;
    },
  );
});

test("a full insight collection rejects another unique insight with capacity metadata", () => {
  assert.throws(
    () =>
      mergeOnboardingDiscoveryState({
        state: stateWithInsightCount(6),
        discovery: discovery({
          stateDelta: {
            insightsToAdd: [
              {
                statement: "A seventh unique decision-relevant pattern.",
                confidence: "medium",
                evidenceMessageIds: [secondMessageId],
              },
            ],
          },
        }),
        allowedMessageIds,
      }),
    (error) => {
      assert.ok(error instanceof ClarityStructuredValidationError);
      assert.equal(error.stage, "state_delta");
      assert.equal(error.code, "artifact_limit_exceeded");
      assert.deepEqual(error.safeMetadata, {
        operationType: "insight_add",
        resultingCount: 7,
        limit: 6,
      });
      return true;
    },
  );
});

test("a full insight collection can update an existing insight during repair", () => {
  const fullState = stateWithInsightCount(6);
  const insightId = onboardingCanonicalStateForModel(fullState).insights[0].insightId;
  const merged = mergeOnboardingDiscoveryState({
    state: fullState,
    discovery: discovery({
      stateDelta: {
        insightsToUpdate: [
          {
            insightId,
            statement: "The first pattern is now better supported.",
            confidence: "high",
            evidenceMessageIds: [firstMessageId, secondMessageId],
          },
        ],
      },
    }),
    allowedMessageIds,
  });

  assert.equal(merged.insights.length, 6);
  assert.equal(merged.insights[0].statement, "The first pattern is now better supported.");
});

test("a full insight collection can omit insight operations during repair", () => {
  const merged = mergeOnboardingDiscoveryState({
    state: stateWithInsightCount(6),
    discovery: discovery(),
    allowedMessageIds,
  });

  assert.equal(merged.insights.length, 6);
});

test("an insight collection with one remaining slot still permits one addition", () => {
  const merged = mergeOnboardingDiscoveryState({
    state: stateWithInsightCount(5),
    discovery: discovery({
      stateDelta: {
        insightsToAdd: [
          {
            statement: "A sixth unique decision-relevant pattern.",
            confidence: "medium",
            evidenceMessageIds: [secondMessageId],
          },
        ],
      },
    }),
    allowedMessageIds,
  });

  assert.equal(merged.insights.length, 6);
});

test("readiness violations retain the failed readiness rule", () => {
  const invalid = discovery({
    readiness: { actionReady: true },
  });
  const merged = mergeOnboardingDiscoveryState({
    state,
    discovery: invalid,
    allowedMessageIds,
  });

  assert.throws(
    () => validateOnboardingReadiness({ discovery: invalid, state: merged }),
    (error) => {
      assert.ok(error instanceof ClarityStructuredValidationError);
      assert.equal(error.stage, "readiness");
      assert.equal(error.code, "action_requires_clear_priority");
      assert.equal(
        error.safeMetadata.readinessRule,
        "action_requires_clear_priority",
      );
      return true;
    },
  );
});

test("readiness and progress can advance without generating synthesis", () => {
  const nextDiscovery = discovery({
    progressDelta: {
      situation: "clear",
      whatMatters: "getting_clearer",
      future: "getting_clearer",
    },
    readiness: { personReady: true, actionReady: false },
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
    questionFocus: null,
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
      unknownIdsToResolve: [
        onboardingCanonicalStateForModel(state).unknowns[0].unknownId,
      ],
    },
    progressDelta: {
      situation: "clear",
      whatMatters: "clear",
      future: "getting_clearer",
      constraints: "clear",
    },
    readiness: {
      personReady: true,
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
  assert.doesNotThrow(() =>
    validateOnboardingReadiness({ discovery: readyDiscovery, state: merged }),
  );
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

test("an actionable bottleneck does not imply person or synthesis readiness", () => {
  const actionReadyDiscovery = discovery({
    progressDelta: {
      situation: "getting_clearer",
      whatMatters: "clear",
      future: "learning",
      constraints: "getting_clearer",
    },
    readiness: {
      personReady: false,
      actionReady: true,
      readyToSynthesize: false,
      reason:
        "The immediate prerequisite is clear, but other major parts of the user's life have not come up yet.",
    },
  });
  const merged = mergeOnboardingDiscoveryState({
    state,
    discovery: actionReadyDiscovery,
    allowedMessageIds,
  });

  assert.doesNotThrow(() =>
    validateOnboardingReadiness({
      discovery: actionReadyDiscovery,
      state: merged,
    }),
  );
  assert.equal(actionReadyDiscovery.readiness.actionReady, true);
  assert.equal(actionReadyDiscovery.readiness.personReady, false);
  assert.equal(actionReadyDiscovery.readiness.readyToSynthesize, false);
});

test("person readiness requires breadth beyond a known first action", () => {
  const premature = discovery({
    progressDelta: {
      situation: "clear",
      whatMatters: "clear",
      future: "learning",
      constraints: "getting_clearer",
    },
    readiness: {
      personReady: true,
      actionReady: true,
      readyToSynthesize: true,
    },
    questionFocus: null,
  });
  const merged = mergeOnboardingDiscoveryState({
    state,
    discovery: premature,
    allowedMessageIds,
  });

  assert.throws(
    () => validateOnboardingReadiness({ discovery: premature, state: merged }),
    /Person readiness requires sufficient breadth/,
  );
});

test("person readiness is blocked by consequential unknowns but not minor ones", () => {
  const highUnknownId = onboardingCanonicalStateForModel(state).unknowns[0].unknownId;
  const blocked = discovery({
    progressDelta: {
      situation: "clear",
      whatMatters: "clear",
      future: "getting_clearer",
      constraints: "clear",
    },
    readiness: {
      personReady: true,
      actionReady: true,
      readyToSynthesize: true,
    },
    questionFocus: null,
  });
  const blockedState = mergeOnboardingDiscoveryState({
    state,
    discovery: blocked,
    allowedMessageIds,
  });
  assert.throws(
    () => validateOnboardingReadiness({ discovery: blocked, state: blockedState }),
    /resolving or explicitly bounding every consequential unknown/,
  );

  const bounded = discovery({
    stateDelta: {
      unknownsToUpdate: [
        {
          unknownId: highUnknownId,
          statement: null,
          materiality: "medium",
        },
      ],
    },
    progressDelta: {
      situation: "clear",
      whatMatters: "clear",
      future: "getting_clearer",
      constraints: "clear",
    },
    readiness: {
      personReady: true,
      actionReady: true,
      readyToSynthesize: true,
    },
    questionFocus: null,
  });
  const boundedState = mergeOnboardingDiscoveryState({
    state,
    discovery: bounded,
    allowedMessageIds,
  });
  assert.doesNotThrow(() =>
    validateOnboardingReadiness({ discovery: bounded, state: boundedState }),
  );
});

test("final synthesis is bounded to a concise First Understanding", () => {
  const longSection = Array.from(
    { length: 30 },
    (_, index) => `detail${index + 1}`,
  ).join(" ");

  assert.throws(
    () =>
      onboardingFinalSynthesisResponseSchema.parse({
        assistantMessage:
          "Here’s the useful picture. Is anything important wrong or missing?",
        synthesis: {
          whereYouAre: longSection,
          whatYouWant: longSection,
          whatYouHaveGoingForYou: longSection,
          whatCouldGetInTheWay: longSection,
          stillUnsure: longSection,
          whatMattersFirst: longSection,
          horizons: {
            shortTerm: longSection,
            midTerm: longSection,
            longTerm: longSection,
            bottleneck: longSection,
            nextMove: longSection,
          },
        },
      }),
    /First Understanding must stay within 300 words/,
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
  assert.match(orchestrator, /validateOnboardingReadiness\(\{ discovery: parsed, state: merged \}\)/);
});
