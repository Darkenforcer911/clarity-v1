import { z } from "zod";

export const ONBOARDING_INTELLIGENCE_VERSION = 2;
export const ONBOARDING_MINIMUM_MEANINGFUL_TURNS = 3;
export const ONBOARDING_SOFT_QUESTION_CAP = 12;

export const onboardingModes = [
  "UNDERSTAND",
  "CLARIFY",
  "REFLECT_INSIGHT",
  "CHALLENGE",
  "EXPAND_POSSIBILITIES",
  "SYNTHESIZE",
] as const;

export const onboardingDiscoveryModes = [
  "UNDERSTAND",
  "CLARIFY",
  "REFLECT_INSIGHT",
  "CHALLENGE",
  "EXPAND_POSSIBILITIES",
] as const;

export const onboardingTruthStates = ["fact", "inference", "unknown"] as const;
export const onboardingConfidenceLevels = ["low", "medium", "high"] as const;
export const onboardingProgressLevels = [
  "learning",
  "getting_clearer",
  "clear",
] as const;

export const onboardingQuestionFocusDomains = [
  "CURRENT_WORK",
  "ECONOMIC_PRESSURE",
  "ACTIVE_PROJECTS",
  "OTHER_INCOME",
  "EDUCATION",
  "RESPONSIBILITIES",
  "CAPABILITIES",
  "CONSTRAINTS",
  "ACTIVE_DIRECTION",
  "FUTURE_PULL",
  "POSSIBILITY_EXPANSION",
  "OTHER",
] as const;

const confidenceSchema = z.enum(onboardingConfidenceLevels);
const progressLevelSchema = z.enum(onboardingProgressLevels);

export const onboardingUnderstandingItemSchema = z
  .object({
    statement: z.string().trim().min(1).max(500),
    truthState: z.enum(onboardingTruthStates),
    confidence: confidenceSchema,
    evidenceMessageIds: z.array(z.string().uuid()).max(8),
  })
  .strict();

const understandingSectionSchema = z.array(onboardingUnderstandingItemSchema).max(10);

export const onboardingUnderstandingSchema = z
  .object({
    currentReality: understandingSectionSchema,
    desiredFuture: understandingSectionSchema,
    capabilitiesAndAssets: understandingSectionSchema,
    constraints: understandingSectionSchema,
    behavioralEvidence: understandingSectionSchema,
    currentPriorityOrPressure: understandingSectionSchema,
    possibleRoutes: understandingSectionSchema,
  })
  .strict();

export const onboardingProgressSchema = z
  .object({
    situation: progressLevelSchema,
    whatMatters: progressLevelSchema,
    future: progressLevelSchema,
    constraints: progressLevelSchema,
    readyForConfirmation: z.boolean(),
  })
  .strict();

export const onboardingUnknownSchema = z
  .object({
    statement: z.string().trim().min(1).max(500),
    materiality: confidenceSchema,
  })
  .strict();

export const onboardingInsightSchema = z
  .object({
    statement: z.string().trim().min(1).max(700),
    confidence: confidenceSchema,
    evidenceMessageIds: z.array(z.string().uuid()).min(1).max(8),
  })
  .strict();

export const onboardingRouteSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    rationale: z.string().trim().min(1).max(500),
    confidence: confidenceSchema,
    evidenceMessageIds: z.array(z.string().uuid()).max(8),
  })
  .strict();

export const onboardingQuestionFocusSchema = z
  .object({
    domain: z.enum(onboardingQuestionFocusDomains),
    target: z.string().trim().min(1).max(240),
    reason: z.string().trim().min(1).max(300),
    relatedUnknownId: z
      .string()
      .regex(/^unknown_[a-f0-9]{20}$/)
      .nullable(),
  })
  .strict();

export const onboardingSynthesisSchema = z
  .object({
    whereYouAre: z.string().trim().min(1).max(1_500),
    whatYouWant: z.string().trim().min(1).max(1_500),
    whatYouHaveGoingForYou: z.string().trim().min(1).max(1_500),
    whatCouldGetInTheWay: z.string().trim().min(1).max(1_500),
    stillUnsure: z.string().trim().min(1).max(1_500),
    whatMattersFirst: z.string().trim().min(1).max(1_500),
    horizons: z
      .object({
        longTerm: z.string().trim().min(1).max(1_000),
        midTerm: z.string().trim().min(1).max(1_000),
        shortTerm: z.string().trim().min(1).max(1_000),
        bottleneck: z.string().trim().min(1).max(1_000),
        nextMove: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  })
  .strict();

export const onboardingIntelligenceResponseSchema = z
  .object({
    assistantMessage: z.string().trim().min(1).max(3_000),
    mode: z.enum(onboardingModes),
    questionFocus: onboardingQuestionFocusSchema.nullable().optional(),
    understanding: onboardingUnderstandingSchema,
    progress: onboardingProgressSchema,
    unknowns: z.array(onboardingUnknownSchema).max(10),
    insights: z.array(onboardingInsightSchema).max(6),
    routes: z.array(onboardingRouteSchema).max(4),
    readiness: z
      .object({
        readyForSynthesis: z.boolean(),
        reason: z.string().trim().min(1).max(500),
      })
      .strict(),
    synthesis: onboardingSynthesisSchema.nullable(),
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
    if (value.readiness.readyForSynthesis !== Boolean(value.synthesis)) {
      context.addIssue({
        code: "custom",
        path: ["synthesis"],
        message: "Synthesis must be supplied exactly when onboarding is ready.",
      });
    }
    if (value.mode === "SYNTHESIZE" !== value.readiness.readyForSynthesis) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "SYNTHESIZE mode must match readiness.",
      });
    }
  });

export type OnboardingIntelligenceResponse = z.infer<
  typeof onboardingIntelligenceResponseSchema
>;
export type OnboardingUnderstanding = z.infer<typeof onboardingUnderstandingSchema>;
export type OnboardingProgress = z.infer<typeof onboardingProgressSchema>;
export type OnboardingSynthesis = z.infer<typeof onboardingSynthesisSchema>;
export type OnboardingUnknown = z.infer<typeof onboardingUnknownSchema>;
export type OnboardingInsight = z.infer<typeof onboardingInsightSchema>;
export type OnboardingRoute = z.infer<typeof onboardingRouteSchema>;
export type OnboardingQuestionFocus = z.infer<
  typeof onboardingQuestionFocusSchema
>;
export type OnboardingQuestionFocusDomain =
  typeof onboardingQuestionFocusDomains[number];

export const onboardingUnderstandingCategories = [
  "currentReality",
  "desiredFuture",
  "capabilitiesAndAssets",
  "constraints",
  "behavioralEvidence",
  "currentPriorityOrPressure",
  "possibleRoutes",
] as const;

export type OnboardingUnderstandingCategory =
  typeof onboardingUnderstandingCategories[number];

export const emptyOnboardingUnderstanding = (): OnboardingUnderstanding => ({
  currentReality: [],
  desiredFuture: [],
  capabilitiesAndAssets: [],
  constraints: [],
  behavioralEvidence: [],
  currentPriorityOrPressure: [],
  possibleRoutes: [],
});

export const emptyOnboardingProgress = (): OnboardingProgress => ({
  situation: "learning",
  whatMatters: "learning",
  future: "learning",
  constraints: "learning",
  readyForConfirmation: false,
});

export function enforceOnboardingStoppingPolicy(input: {
  output: OnboardingIntelligenceResponse;
  meaningfulUserTurns: number;
}): OnboardingIntelligenceResponse {
  const personAndActionReady = hasOnboardingPersonAndActionReadiness(
    input.output,
  );
  const decisionReadyFirstTurn =
    input.meaningfulUserTurns === 1 && personAndActionReady;
  const maySynthesize =
    (input.meaningfulUserTurns >= ONBOARDING_MINIMUM_MEANINGFUL_TURNS &&
      personAndActionReady) ||
    decisionReadyFirstTurn;

  if (maySynthesize || !input.output.readiness.readyForSynthesis) {
    return {
      ...input.output,
      progress: {
        ...input.output.progress,
        readyForConfirmation: input.output.readiness.readyForSynthesis,
      },
    };
  }

  return {
    ...input.output,
    mode: "CLARIFY",
    progress: {
      ...input.output.progress,
      readyForConfirmation: false,
    },
    readiness: {
      readyForSynthesis: false,
      reason: "More user-authored evidence is needed before synthesis.",
    },
    synthesis: null,
  };
}

export function hasOnboardingPersonAndActionReadiness(
  output: OnboardingIntelligenceResponse,
) {
  return (
    output.progress.situation === "clear" &&
    output.progress.whatMatters === "clear" &&
    output.progress.future !== "learning" &&
    output.progress.constraints !== "learning"
  );
}

export function validateOnboardingEvidenceReferences(
  output: OnboardingIntelligenceResponse,
  allowedMessageIds: ReadonlySet<string>,
) {
  const references = [
    ...Object.values(output.understanding).flatMap((items) =>
      items.flatMap((item) => item.evidenceMessageIds),
    ),
    ...output.insights.flatMap((item) => item.evidenceMessageIds),
    ...output.routes.flatMap((item) => item.evidenceMessageIds),
  ];
  if (references.some((messageId) => !allowedMessageIds.has(messageId))) {
    throw new Error("Onboarding output referenced an unknown message.");
  }
  for (const items of Object.values(output.understanding)) {
    for (const item of items) {
      if (item.truthState !== "unknown" && item.evidenceMessageIds.length === 0) {
        throw new Error("Grounded onboarding claims require message evidence.");
      }
    }
  }
  return output;
}

const evidenceMessageIdsJsonSchema = {
  type: "array",
  maxItems: 8,
  items: { type: "string" },
} as const;

const understandingItemsJsonSchema = {
  type: "array",
  maxItems: 10,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["statement", "truthState", "confidence", "evidenceMessageIds"],
    properties: {
      statement: { type: "string", minLength: 1, maxLength: 500 },
      truthState: { type: "string", enum: onboardingTruthStates },
      confidence: { type: "string", enum: onboardingConfidenceLevels },
      evidenceMessageIds: evidenceMessageIdsJsonSchema,
    },
  },
} as const;

const text1500 = { type: "string", minLength: 1, maxLength: 1500 } as const;
const text1000 = { type: "string", minLength: 1, maxLength: 1000 } as const;

export const onboardingIntelligenceResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "assistantMessage",
    "mode",
    "understanding",
    "progress",
    "unknowns",
    "insights",
    "routes",
    "readiness",
    "synthesis",
  ],
  properties: {
    assistantMessage: { type: "string", minLength: 1, maxLength: 3000 },
    mode: { type: "string", enum: onboardingModes },
    understanding: {
      type: "object",
      additionalProperties: false,
      required: [
        "currentReality",
        "desiredFuture",
        "capabilitiesAndAssets",
        "constraints",
        "behavioralEvidence",
        "currentPriorityOrPressure",
        "possibleRoutes",
      ],
      properties: Object.fromEntries(
        [
          "currentReality",
          "desiredFuture",
          "capabilitiesAndAssets",
          "constraints",
          "behavioralEvidence",
          "currentPriorityOrPressure",
          "possibleRoutes",
        ].map((key) => [key, understandingItemsJsonSchema]),
      ),
    },
    progress: {
      type: "object",
      additionalProperties: false,
      required: [
        "situation",
        "whatMatters",
        "future",
        "constraints",
        "readyForConfirmation",
      ],
      properties: {
        situation: { type: "string", enum: onboardingProgressLevels },
        whatMatters: { type: "string", enum: onboardingProgressLevels },
        future: { type: "string", enum: onboardingProgressLevels },
        constraints: { type: "string", enum: onboardingProgressLevels },
        readyForConfirmation: { type: "boolean" },
      },
    },
    unknowns: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "materiality"],
        properties: {
          statement: { type: "string", minLength: 1, maxLength: 500 },
          materiality: { type: "string", enum: onboardingConfidenceLevels },
        },
      },
    },
    insights: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "confidence", "evidenceMessageIds"],
        properties: {
          statement: { type: "string", minLength: 1, maxLength: 700 },
          confidence: { type: "string", enum: onboardingConfidenceLevels },
          evidenceMessageIds: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
        },
      },
    },
    routes: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "rationale", "confidence", "evidenceMessageIds"],
        properties: {
          label: { type: "string", minLength: 1, maxLength: 120 },
          rationale: { type: "string", minLength: 1, maxLength: 500 },
          confidence: { type: "string", enum: onboardingConfidenceLevels },
          evidenceMessageIds: {
            type: "array",
            maxItems: 8,
            items: { type: "string" },
          },
        },
      },
    },
    readiness: {
      type: "object",
      additionalProperties: false,
      required: ["readyForSynthesis", "reason"],
      properties: {
        readyForSynthesis: { type: "boolean" },
        reason: { type: "string", minLength: 1, maxLength: 500 },
      },
    },
    synthesis: {
      anyOf: [
        { type: "null" },
        {
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
            whereYouAre: text1500,
            whatYouWant: text1500,
            whatYouHaveGoingForYou: text1500,
            whatCouldGetInTheWay: text1500,
            stillUnsure: text1500,
            whatMattersFirst: text1500,
            horizons: {
              type: "object",
              additionalProperties: false,
              required: ["longTerm", "midTerm", "shortTerm", "bottleneck", "nextMove"],
              properties: {
                longTerm: text1000,
                midTerm: text1000,
                shortTerm: text1000,
                bottleneck: text1000,
                nextMove: text1000,
              },
            },
          },
        },
      ],
    },
  },
} as const;
