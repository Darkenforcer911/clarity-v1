import { createHash } from "node:crypto";

import { z } from "zod";

import {
  onboardingConfidenceLevels,
  onboardingDiscoveryModes,
  onboardingInsightSchema,
  onboardingIntelligenceResponseSchema,
  onboardingProgressSchema,
  onboardingProgressLevels,
  onboardingRouteSchema,
  onboardingSynthesisSchema,
  onboardingTruthStates,
  onboardingUnderstandingCategories,
  onboardingUnknownSchema,
  onboardingUnderstandingSchema,
  validateOnboardingEvidenceReferences,
  type OnboardingIntelligenceResponse,
  type OnboardingInsight,
  type OnboardingProgress,
  type OnboardingRoute,
  type OnboardingSynthesis,
  type OnboardingUnderstanding,
  type OnboardingUnderstandingCategory,
  type OnboardingUnknown,
} from "./onboarding-intelligence.ts";

const stateIdentitySchema = z
  .string()
  .regex(/^(claim|unknown|insight|route)_[a-f0-9]{20}$/);
const evidenceMessageIdsSchema = z.array(z.string().uuid()).max(8);

const claimAddSchema = z
  .object({
    category: z.enum(onboardingUnderstandingCategories),
    statement: z.string().trim().min(1).max(500),
    truthState: z.enum(onboardingTruthStates),
    confidence: z.enum(onboardingConfidenceLevels),
    evidenceMessageIds: evidenceMessageIdsSchema,
  })
  .strict();

const claimUpdateSchema = z
  .object({
    claimId: stateIdentitySchema,
    statement: z.string().trim().min(1).max(500).nullable(),
    truthState: z.enum(onboardingTruthStates).nullable(),
    confidence: z.enum(onboardingConfidenceLevels).nullable(),
    evidenceMessageIds: evidenceMessageIdsSchema.nullable(),
  })
  .strict();

const unknownAddSchema = onboardingUnknownSchema;
const insightAddSchema = onboardingInsightSchema;
const routeAddSchema = onboardingRouteSchema;

const unknownUpdateSchema = z
  .object({
    unknownId: stateIdentitySchema,
    statement: z.string().trim().min(1).max(500).nullable(),
    materiality: z.enum(onboardingConfidenceLevels).nullable(),
  })
  .strict();

const insightUpdateSchema = z
  .object({
    insightId: stateIdentitySchema,
    statement: z.string().trim().min(1).max(700).nullable(),
    confidence: z.enum(onboardingConfidenceLevels).nullable(),
    evidenceMessageIds: evidenceMessageIdsSchema.nullable(),
  })
  .strict();

const routeUpdateSchema = z
  .object({
    routeId: stateIdentitySchema,
    label: z.string().trim().min(1).max(120).nullable(),
    rationale: z.string().trim().min(1).max(500).nullable(),
    confidence: z.enum(onboardingConfidenceLevels).nullable(),
    evidenceMessageIds: evidenceMessageIdsSchema.nullable(),
  })
  .strict();

export const onboardingDiscoveryResponseSchema = z
  .object({
    assistantMessage: z.string().trim().min(1).max(1_500),
    mode: z.enum(onboardingDiscoveryModes),
    stateDelta: z
      .object({
        claimsToAdd: z.array(claimAddSchema).max(8),
        claimsToUpdate: z.array(claimUpdateSchema).max(8),
        claimIdsToRemove: z.array(stateIdentitySchema).max(8),
        unknownsToAdd: z.array(unknownAddSchema).max(6),
        unknownsToUpdate: z.array(unknownUpdateSchema).max(6),
        unknownIdsToResolve: z.array(stateIdentitySchema).max(8),
        insightsToAdd: z.array(insightAddSchema).max(4),
        insightsToUpdate: z.array(insightUpdateSchema).max(4),
        insightIdsToRemove: z.array(stateIdentitySchema).max(6),
        routesToAdd: z.array(routeAddSchema).max(4),
        routesToUpdate: z.array(routeUpdateSchema).max(4),
        routeIdsToRemove: z.array(stateIdentitySchema).max(4),
      })
      .strict(),
    progressDelta: z
      .object({
        situation: z.enum(onboardingProgressLevels).nullable(),
        whatMatters: z.enum(onboardingProgressLevels).nullable(),
        future: z.enum(onboardingProgressLevels).nullable(),
        constraints: z.enum(onboardingProgressLevels).nullable(),
      })
      .strict(),
    readiness: z
      .object({
        understandingReady: z.boolean(),
        actionReady: z.boolean(),
        readyToSynthesize: z.boolean(),
        reason: z.string().trim().min(1).max(500),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.assistantMessage.match(/\?/g) ?? []).length > 1) {
      context.addIssue({
        code: "custom",
        path: ["assistantMessage"],
        message: "Ask at most one main question.",
      });
    }
    if (
      value.readiness.readyToSynthesize &&
      (!value.readiness.understandingReady || !value.readiness.actionReady)
    ) {
      context.addIssue({
        code: "custom",
        path: ["readiness", "readyToSynthesize"],
        message: "Synthesis requires understanding and action readiness.",
      });
    }
    rejectConflictingIds(value.stateDelta, context);
  });

export const onboardingFinalSynthesisResponseSchema = z
  .object({
    assistantMessage: z.string().trim().min(1).max(3_000),
    synthesis: onboardingSynthesisSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.assistantMessage.match(/\?/g) ?? []).length > 1) {
      context.addIssue({
        code: "custom",
        path: ["assistantMessage"],
        message: "Ask at most one main question.",
      });
    }
  });

export type OnboardingDiscoveryResponse = z.infer<
  typeof onboardingDiscoveryResponseSchema
>;
export type OnboardingFinalSynthesisResponse = z.infer<
  typeof onboardingFinalSynthesisResponseSchema
>;

export type OnboardingCanonicalState = {
  understanding: OnboardingUnderstanding;
  progress: OnboardingProgress;
  unknowns: OnboardingUnknown[];
  insights: OnboardingInsight[];
  routes: OnboardingRoute[];
  synthesis: OnboardingSynthesis | null;
};

export const onboardingDiscoveryResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "assistantMessage",
    "mode",
    "stateDelta",
    "progressDelta",
    "readiness",
  ],
  properties: {
    assistantMessage: { type: "string", minLength: 1, maxLength: 1500 },
    mode: { type: "string", enum: onboardingDiscoveryModes },
    stateDelta: {
      type: "object",
      additionalProperties: false,
      required: [
        "claimsToAdd",
        "claimsToUpdate",
        "claimIdsToRemove",
        "unknownsToAdd",
        "unknownsToUpdate",
        "unknownIdsToResolve",
        "insightsToAdd",
        "insightsToUpdate",
        "insightIdsToRemove",
        "routesToAdd",
        "routesToUpdate",
        "routeIdsToRemove",
      ],
      properties: {
        claimsToAdd: arraySchema(claimAddJsonSchema(), 8),
        claimsToUpdate: arraySchema(claimUpdateJsonSchema(), 8),
        claimIdsToRemove: arraySchema(identityJsonSchema(), 8),
        unknownsToAdd: arraySchema(unknownJsonSchema(), 6),
        unknownsToUpdate: arraySchema(unknownUpdateJsonSchema(), 6),
        unknownIdsToResolve: arraySchema(identityJsonSchema(), 8),
        insightsToAdd: arraySchema(insightJsonSchema(), 4),
        insightsToUpdate: arraySchema(insightUpdateJsonSchema(), 4),
        insightIdsToRemove: arraySchema(identityJsonSchema(), 6),
        routesToAdd: arraySchema(routeJsonSchema(), 4),
        routesToUpdate: arraySchema(routeUpdateJsonSchema(), 4),
        routeIdsToRemove: arraySchema(identityJsonSchema(), 4),
      },
    },
    progressDelta: {
      type: "object",
      additionalProperties: false,
      required: ["situation", "whatMatters", "future", "constraints"],
      properties: Object.fromEntries(
        ["situation", "whatMatters", "future", "constraints"].map((key) => [
          key,
          nullableEnum(onboardingProgressLevels),
        ]),
      ),
    },
    readiness: {
      type: "object",
      additionalProperties: false,
      required: [
        "understandingReady",
        "actionReady",
        "readyToSynthesize",
        "reason",
      ],
      properties: {
        understandingReady: { type: "boolean" },
        actionReady: { type: "boolean" },
        readyToSynthesize: { type: "boolean" },
        reason: { type: "string", minLength: 1, maxLength: 500 },
      },
    },
  },
} as const;

export const onboardingFinalSynthesisResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assistantMessage", "synthesis"],
  properties: {
    assistantMessage: { type: "string", minLength: 1, maxLength: 3000 },
    synthesis: synthesisJsonSchema(),
  },
} as const;

export function onboardingCanonicalStateForModel(
  state: OnboardingCanonicalState,
) {
  return {
    claims: onboardingUnderstandingCategories.flatMap((category) =>
      state.understanding[category].map((claim) => ({
        claimId: stateId("claim", [category, claim]),
        category,
        ...claim,
      })),
    ),
    progress: state.progress,
    unknowns: state.unknowns.map((unknown) => ({
      unknownId: stateId("unknown", unknown),
      ...unknown,
    })),
    insights: state.insights.map((insight) => ({
      insightId: stateId("insight", insight),
      ...insight,
    })),
    routes: state.routes.map((route) => ({
      routeId: stateId("route", route),
      ...route,
    })),
    priorSynthesis: state.synthesis,
  };
}

export function mergeOnboardingDiscoveryState(input: {
  state: OnboardingCanonicalState;
  discovery: OnboardingDiscoveryResponse;
  allowedMessageIds: ReadonlySet<string>;
}): OnboardingCanonicalState {
  const { state, discovery, allowedMessageIds } = input;
  const modelState = onboardingCanonicalStateForModel(state);
  const claimsById = new Map(modelState.claims.map((claim) => [claim.claimId, claim]));
  const unknownsById = new Map(
    modelState.unknowns.map((unknown) => [unknown.unknownId, unknown]),
  );
  const insightsById = new Map(
    modelState.insights.map((insight) => [insight.insightId, insight]),
  );
  const routesById = new Map(
    modelState.routes.map((route) => [route.routeId, route]),
  );

  validateReferencedIds(discovery, {
    claims: claimsById,
    unknowns: unknownsById,
    insights: insightsById,
    routes: routesById,
  });
  validateDiscoveryEvidence(discovery, allowedMessageIds);

  const removedClaimIds = new Set(discovery.stateDelta.claimIdsToRemove);
  const claimUpdates = new Map(
    discovery.stateDelta.claimsToUpdate.map((update) => [update.claimId, update]),
  );
  const understanding = Object.fromEntries(
    onboardingUnderstandingCategories.map((category) => {
      const merged = state.understanding[category]
        .filter((claim) => !removedClaimIds.has(stateId("claim", [category, claim])))
        .map((claim) => {
          const update = claimUpdates.get(stateId("claim", [category, claim]));
          if (!update) return claim;
          return {
            statement: update.statement ?? claim.statement,
            truthState: update.truthState ?? claim.truthState,
            confidence: update.confidence ?? claim.confidence,
            evidenceMessageIds:
              update.evidenceMessageIds ?? claim.evidenceMessageIds,
          };
        });
      for (const addition of discovery.stateDelta.claimsToAdd) {
        if (addition.category !== category) continue;
        addUniqueClaim(merged, addition);
      }
      if (merged.length > 10) {
        throw new Error(`Onboarding ${category} exceeds its bounded claim limit.`);
      }
      return [category, merged];
    }),
  ) as OnboardingUnderstanding;

  const unknowns = mergeArtifacts({
    current: state.unknowns,
    identified: modelState.unknowns,
    idKey: "unknownId",
    removals: discovery.stateDelta.unknownIdsToResolve,
    updates: discovery.stateDelta.unknownsToUpdate,
    additions: discovery.stateDelta.unknownsToAdd,
    max: 10,
    applyUpdate: (unknown, update) => ({
      statement: update.statement ?? unknown.statement,
      materiality: update.materiality ?? unknown.materiality,
    }),
    equalityKey: (unknown) => normalizeText(unknown.statement),
  });
  const insights = mergeArtifacts({
    current: state.insights,
    identified: modelState.insights,
    idKey: "insightId",
    removals: discovery.stateDelta.insightIdsToRemove,
    updates: discovery.stateDelta.insightsToUpdate,
    additions: discovery.stateDelta.insightsToAdd,
    max: 6,
    applyUpdate: (insight, update) => ({
      statement: update.statement ?? insight.statement,
      confidence: update.confidence ?? insight.confidence,
      evidenceMessageIds:
        update.evidenceMessageIds ?? insight.evidenceMessageIds,
    }),
    equalityKey: (insight) => normalizeText(insight.statement),
  });
  const routes = mergeArtifacts({
    current: state.routes,
    identified: modelState.routes,
    idKey: "routeId",
    removals: discovery.stateDelta.routeIdsToRemove,
    updates: discovery.stateDelta.routesToUpdate,
    additions: discovery.stateDelta.routesToAdd,
    max: 4,
    applyUpdate: (route, update) => ({
      label: update.label ?? route.label,
      rationale: update.rationale ?? route.rationale,
      confidence: update.confidence ?? route.confidence,
      evidenceMessageIds: update.evidenceMessageIds ?? route.evidenceMessageIds,
    }),
    equalityKey: (route) => normalizeText(route.label),
  });

  const mergedState: OnboardingCanonicalState = {
    understanding,
    progress: {
      situation: discovery.progressDelta.situation ?? state.progress.situation,
      whatMatters:
        discovery.progressDelta.whatMatters ?? state.progress.whatMatters,
      future: discovery.progressDelta.future ?? state.progress.future,
      constraints:
        discovery.progressDelta.constraints ?? state.progress.constraints,
      readyForConfirmation: discovery.readiness.readyToSynthesize,
    },
    unknowns,
    insights,
    routes,
    synthesis: discovery.readiness.readyToSynthesize ? state.synthesis : null,
  };

  validateCanonicalState(mergedState, allowedMessageIds);
  return mergedState;
}

export function composeOnboardingTurnResponse(input: {
  discovery: OnboardingDiscoveryResponse;
  state: OnboardingCanonicalState;
  synthesis: OnboardingFinalSynthesisResponse | null;
  allowedMessageIds: ReadonlySet<string>;
}): OnboardingIntelligenceResponse {
  if (input.discovery.readiness.readyToSynthesize !== Boolean(input.synthesis)) {
    throw new Error("Final synthesis must match validated onboarding readiness.");
  }
  const readyForSynthesis = Boolean(input.synthesis);
  const output = onboardingIntelligenceResponseSchema.parse({
    assistantMessage:
      input.synthesis?.assistantMessage ?? input.discovery.assistantMessage,
    mode: readyForSynthesis ? "SYNTHESIZE" : input.discovery.mode,
    understanding: input.state.understanding,
    progress: {
      ...input.state.progress,
      readyForConfirmation: readyForSynthesis,
    },
    unknowns: input.state.unknowns,
    insights: input.state.insights,
    routes: input.state.routes,
    readiness: {
      readyForSynthesis,
      reason: input.discovery.readiness.reason,
    },
    synthesis: input.synthesis?.synthesis ?? null,
  });
  validateOnboardingEvidenceReferences(output, input.allowedMessageIds);
  return output;
}

function validateReferencedIds(
  discovery: OnboardingDiscoveryResponse,
  indexes: {
    claims: ReadonlyMap<string, unknown>;
    unknowns: ReadonlyMap<string, unknown>;
    insights: ReadonlyMap<string, unknown>;
    routes: ReadonlyMap<string, unknown>;
  },
) {
  for (const id of [
    ...discovery.stateDelta.claimIdsToRemove,
    ...discovery.stateDelta.claimsToUpdate.map((item) => item.claimId),
  ]) {
    if (!indexes.claims.has(id)) throw new Error("Unknown onboarding claim ID.");
  }
  for (const id of [
    ...discovery.stateDelta.unknownIdsToResolve,
    ...discovery.stateDelta.unknownsToUpdate.map((item) => item.unknownId),
  ]) {
    if (!indexes.unknowns.has(id)) throw new Error("Unknown onboarding unknown ID.");
  }
  for (const id of [
    ...discovery.stateDelta.insightIdsToRemove,
    ...discovery.stateDelta.insightsToUpdate.map((item) => item.insightId),
  ]) {
    if (!indexes.insights.has(id)) throw new Error("Unknown onboarding insight ID.");
  }
  for (const id of [
    ...discovery.stateDelta.routeIdsToRemove,
    ...discovery.stateDelta.routesToUpdate.map((item) => item.routeId),
  ]) {
    if (!indexes.routes.has(id)) throw new Error("Unknown onboarding route ID.");
  }
}

function validateDiscoveryEvidence(
  discovery: OnboardingDiscoveryResponse,
  allowedMessageIds: ReadonlySet<string>,
) {
  const claims = discovery.stateDelta.claimsToAdd;
  const updatedClaims = discovery.stateDelta.claimsToUpdate;
  for (const claim of claims) {
    validateEvidenceIds(claim.evidenceMessageIds, allowedMessageIds);
    if (claim.truthState !== "unknown" && claim.evidenceMessageIds.length === 0) {
      throw new Error("Grounded onboarding claims require message evidence.");
    }
  }
  for (const update of updatedClaims) {
    if (update.evidenceMessageIds) {
      validateEvidenceIds(update.evidenceMessageIds, allowedMessageIds);
    }
  }
  for (const item of [
    ...discovery.stateDelta.insightsToAdd,
    ...discovery.stateDelta.routesToAdd,
  ]) {
    validateEvidenceIds(item.evidenceMessageIds, allowedMessageIds);
  }
  for (const item of [
    ...discovery.stateDelta.insightsToUpdate,
    ...discovery.stateDelta.routesToUpdate,
  ]) {
    if (item.evidenceMessageIds) {
      validateEvidenceIds(item.evidenceMessageIds, allowedMessageIds);
    }
  }
}

function validateEvidenceIds(
  evidenceMessageIds: string[],
  allowedMessageIds: ReadonlySet<string>,
) {
  if (evidenceMessageIds.some((id) => !allowedMessageIds.has(id))) {
    throw new Error("Onboarding delta referenced an unknown user message.");
  }
}

function validateCanonicalState(
  state: OnboardingCanonicalState,
  allowedMessageIds: ReadonlySet<string>,
) {
  onboardingUnderstandingSchema.parse(state.understanding);
  onboardingProgressSchema.parse(state.progress);
  z.array(onboardingUnknownSchema).max(10).parse(state.unknowns);
  z.array(onboardingInsightSchema).max(6).parse(state.insights);
  z.array(onboardingRouteSchema).max(4).parse(state.routes);

  for (const claim of Object.values(state.understanding).flat()) {
    validateEvidenceIds(claim.evidenceMessageIds, allowedMessageIds);
    if (claim.truthState !== "unknown" && claim.evidenceMessageIds.length === 0) {
      throw new Error("Grounded onboarding claims require message evidence.");
    }
  }
  for (const item of [...state.insights, ...state.routes]) {
    validateEvidenceIds(item.evidenceMessageIds, allowedMessageIds);
  }
}

function addUniqueClaim(
  claims: OnboardingUnderstanding[OnboardingUnderstandingCategory],
  addition: z.infer<typeof claimAddSchema>,
) {
  const existing = claims.find(
    (claim) => normalizeText(claim.statement) === normalizeText(addition.statement),
  );
  if (!existing) {
    claims.push({
      statement: addition.statement,
      truthState: addition.truthState,
      confidence: addition.confidence,
      evidenceMessageIds: addition.evidenceMessageIds,
    });
    return;
  }
  if (
    existing.truthState !== addition.truthState ||
    existing.confidence !== addition.confidence ||
    JSON.stringify(existing.evidenceMessageIds) !==
      JSON.stringify(addition.evidenceMessageIds)
  ) {
    throw new Error("Use a claim update instead of adding a conflicting claim.");
  }
}

function mergeArtifacts<
  Item,
  Identified extends Item & Record<IdKey, string>,
  Update extends Record<IdKey, string>,
  IdKey extends "unknownId" | "insightId" | "routeId",
>(input: {
  current: Item[];
  identified: Identified[];
  idKey: IdKey;
  removals: string[];
  updates: Update[];
  additions: Item[];
  max: number;
  applyUpdate: (item: Item, update: Update) => Item;
  equalityKey: (item: Item) => string;
}) {
  const idByIndex: string[] = input.identified.map(
    (item) => item[input.idKey] as string,
  );
  const removed = new Set(input.removals);
  const updates = new Map<string, Update>(
    input.updates.map((item) => [item[input.idKey], item]),
  );
  const merged = input.current
    .map((item, index) => ({ item, id: idByIndex[index] }))
    .filter(({ id }) => !removed.has(id))
    .map(({ item, id }) => {
      const update = updates.get(id);
      return update ? input.applyUpdate(item, update) : item;
    });
  const keys = new Set(merged.map(input.equalityKey));
  for (const addition of input.additions) {
    const key = input.equalityKey(addition);
    if (keys.has(key)) continue;
    merged.push(addition);
    keys.add(key);
  }
  if (merged.length > input.max) {
    throw new Error("Onboarding artifact state exceeds its bounded limit.");
  }
  return merged;
}

function rejectConflictingIds(
  delta: OnboardingDiscoveryResponse["stateDelta"],
  context: z.RefinementCtx,
) {
  rejectConflictingIdSet(
    delta.claimsToUpdate.map((item) => item.claimId),
    delta.claimIdsToRemove,
    "claims",
    context,
  );
  rejectConflictingIdSet(
    delta.unknownsToUpdate.map((item) => item.unknownId),
    delta.unknownIdsToResolve,
    "unknowns",
    context,
  );
  rejectConflictingIdSet(
    delta.insightsToUpdate.map((item) => item.insightId),
    delta.insightIdsToRemove,
    "insights",
    context,
  );
  rejectConflictingIdSet(
    delta.routesToUpdate.map((item) => item.routeId),
    delta.routeIdsToRemove,
    "routes",
    context,
  );
}

function rejectConflictingIdSet(
  updates: string[],
  removals: string[],
  path: string,
  context: z.RefinementCtx,
) {
  if (
    new Set(updates).size !== updates.length ||
    removals.some((id) => updates.includes(id)) ||
    new Set(removals).size !== removals.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["stateDelta", path],
      message: "Each state identity may be changed only once per turn.",
    });
  }
}

function stateId(
  prefix: "claim" | "unknown" | "insight" | "route",
  value: unknown,
) {
  return `${prefix}_${createHash("sha256")
    .update(stableSerialize(value))
    .digest("hex")
    .slice(0, 20)}`;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function arraySchema(items: Record<string, unknown>, maxItems: number) {
  return { type: "array", maxItems, items };
}

function identityJsonSchema() {
  return {
    type: "string",
    pattern: "^(claim|unknown|insight|route)_[a-f0-9]{20}$",
  };
}

function nullableEnum(values: readonly string[]) {
  return { anyOf: [{ type: "string", enum: values }, { type: "null" }] };
}

function nullableString(maxLength: number) {
  return {
    anyOf: [
      { type: "string", minLength: 1, maxLength },
      { type: "null" },
    ],
  };
}

function nullableEvidenceIds() {
  return {
    anyOf: [
      arraySchema({ type: "string" }, 8),
      { type: "null" },
    ],
  };
}

function claimAddJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "category",
      "statement",
      "truthState",
      "confidence",
      "evidenceMessageIds",
    ],
    properties: {
      category: { type: "string", enum: onboardingUnderstandingCategories },
      statement: { type: "string", minLength: 1, maxLength: 500 },
      truthState: { type: "string", enum: onboardingTruthStates },
      confidence: { type: "string", enum: onboardingConfidenceLevels },
      evidenceMessageIds: arraySchema({ type: "string" }, 8),
    },
  };
}

function claimUpdateJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "claimId",
      "statement",
      "truthState",
      "confidence",
      "evidenceMessageIds",
    ],
    properties: {
      claimId: identityJsonSchema(),
      statement: nullableString(500),
      truthState: nullableEnum(onboardingTruthStates),
      confidence: nullableEnum(onboardingConfidenceLevels),
      evidenceMessageIds: nullableEvidenceIds(),
    },
  };
}

function unknownJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["statement", "materiality"],
    properties: {
      statement: { type: "string", minLength: 1, maxLength: 500 },
      materiality: { type: "string", enum: onboardingConfidenceLevels },
    },
  };
}

function unknownUpdateJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["unknownId", "statement", "materiality"],
    properties: {
      unknownId: identityJsonSchema(),
      statement: nullableString(500),
      materiality: nullableEnum(onboardingConfidenceLevels),
    },
  };
}

function insightJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["statement", "confidence", "evidenceMessageIds"],
    properties: {
      statement: { type: "string", minLength: 1, maxLength: 700 },
      confidence: { type: "string", enum: onboardingConfidenceLevels },
      evidenceMessageIds: arraySchema({ type: "string" }, 8),
    },
  };
}

function insightUpdateJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "insightId",
      "statement",
      "confidence",
      "evidenceMessageIds",
    ],
    properties: {
      insightId: identityJsonSchema(),
      statement: nullableString(700),
      confidence: nullableEnum(onboardingConfidenceLevels),
      evidenceMessageIds: nullableEvidenceIds(),
    },
  };
}

function routeJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label", "rationale", "confidence", "evidenceMessageIds"],
    properties: {
      label: { type: "string", minLength: 1, maxLength: 120 },
      rationale: { type: "string", minLength: 1, maxLength: 500 },
      confidence: { type: "string", enum: onboardingConfidenceLevels },
      evidenceMessageIds: arraySchema({ type: "string" }, 8),
    },
  };
}

function routeUpdateJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "routeId",
      "label",
      "rationale",
      "confidence",
      "evidenceMessageIds",
    ],
    properties: {
      routeId: identityJsonSchema(),
      label: nullableString(120),
      rationale: nullableString(500),
      confidence: nullableEnum(onboardingConfidenceLevels),
      evidenceMessageIds: nullableEvidenceIds(),
    },
  };
}

function synthesisJsonSchema() {
  const text = (maxLength: number) => ({
    type: "string",
    minLength: 1,
    maxLength,
  });
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "whereYouAre",
      "whatYouWant",
      "whatYouHaveGoingForYou",
      "whatCouldGetInTheWay",
      "stillUnsure",
      "whatMattersFirst",
      "horizons",
    ],
    properties: {
      whereYouAre: text(1500),
      whatYouWant: text(1500),
      whatYouHaveGoingForYou: text(1500),
      whatCouldGetInTheWay: text(1500),
      stillUnsure: text(1500),
      whatMattersFirst: text(1500),
      horizons: {
        type: "object",
        additionalProperties: false,
        required: [
          "longTerm",
          "midTerm",
          "shortTerm",
          "bottleneck",
          "nextMove",
        ],
        properties: {
          longTerm: text(1000),
          midTerm: text(1000),
          shortTerm: text(1000),
          bottleneck: text(1000),
          nextMove: text(1000),
        },
      },
    },
  };
}
