import { z } from "zod";

export const clarityConversationNextMoves = [
  "ask",
  "clarify",
  "synthesize",
  "recommend",
] as const;

export const clarityTruthStates = [
  "user_reported",
  "confirmed",
  "observed",
  "inferred",
  "externally_verified",
  "unknown",
] as const;

const confidenceSchema = z.enum(["low", "medium", "high"]);

export const clarityMemoryUpdateCandidateSchema = z
  .object({
    type: z.literal("memory_update"),
    targetMemoryItemId: z.string().uuid(),
    replacementStatement: z.string().trim().min(1).max(1000),
    effectiveOn: z.iso.date().nullable(),
    summary: z.string().trim().min(1).max(240),
    rationale: z.string().trim().min(1).max(1000),
  })
  .strict();

export type ClarityMemoryUpdateCandidate = z.infer<
  typeof clarityMemoryUpdateCandidateSchema
>;

export const clarityActionRelativeDueAtPattern =
  /^(?:today|tomorrow|tonight|(?:this|next)_(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:T(?:[01]\d|2[0-3]):[0-5]\d)?$/;

export const clarityActionRelativeDueAtSchema = z
  .string()
  .regex(clarityActionRelativeDueAtPattern);

export const clarityActionCreateCandidateSchema = z
  .object({
    type: z.literal("action_create"),
    title: z.string().trim().min(1).max(200),
    dueAt: z
      .union([
        z.iso.date(),
        z.iso.datetime({ offset: true }),
        clarityActionRelativeDueAtSchema,
      ])
      .nullable(),
    preferredDay: z.iso.date().nullable(),
    durationMinutes: z.number().int().min(1).max(1440).nullable(),
    summary: z.string().trim().min(1).max(240),
    rationale: z.string().trim().min(1).max(1000),
  })
  .strict();

export type ClarityActionCreateCandidate = z.infer<
  typeof clarityActionCreateCandidateSchema
>;

export const clarityProposalCandidateSchema = z.discriminatedUnion("type", [
  clarityMemoryUpdateCandidateSchema,
  clarityActionCreateCandidateSchema,
]);

export type ClarityProposalCandidate = z.infer<
  typeof clarityProposalCandidateSchema
>;

export const clarityConversationResponseSchema = z
  .object({
    response: z.string().trim().min(1).max(8000),
    nextMove: z
      .object({
        type: z.enum(clarityConversationNextMoves),
      })
      .strict(),
    understanding: z
      .object({
        learned: z
          .array(
            z
              .object({
                statement: z.string().trim().min(1).max(500),
                truthState: z.enum(clarityTruthStates),
                confidence: confidenceSchema,
              })
              .strict(),
          )
          .max(8),
      })
      .strict(),
    uncertainties: z
      .array(
        z
          .object({
            statement: z.string().trim().min(1).max(500),
            importance: confidenceSchema,
          })
          .strict(),
      )
      .max(6),
    requiresCurrentVerification: z.boolean(),
    verificationNeed: z.string().trim().min(1).max(500).nullable(),
    proposalCandidate: clarityProposalCandidateSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.requiresCurrentVerification !== Boolean(value.verificationNeed)) {
      context.addIssue({
        code: "custom",
        message:
          "verificationNeed must be supplied exactly when current verification is required.",
        path: ["verificationNeed"],
      });
    }
  });

export type ClarityConversationResponse = z.infer<
  typeof clarityConversationResponseSchema
>;

export const clarityConversationResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "response",
    "nextMove",
    "understanding",
    "uncertainties",
    "requiresCurrentVerification",
    "verificationNeed",
    "proposalCandidate",
  ],
  properties: {
    response: { type: "string", minLength: 1, maxLength: 8000 },
    nextMove: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { type: "string", enum: clarityConversationNextMoves },
      },
    },
    understanding: {
      type: "object",
      additionalProperties: false,
      required: ["learned"],
      properties: {
        learned: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["statement", "truthState", "confidence"],
            properties: {
              statement: { type: "string", minLength: 1, maxLength: 500 },
              truthState: { type: "string", enum: clarityTruthStates },
              confidence: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
            },
          },
        },
      },
    },
    uncertainties: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "importance"],
        properties: {
          statement: { type: "string", minLength: 1, maxLength: 500 },
          importance: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
      },
    },
    requiresCurrentVerification: { type: "boolean" },
    verificationNeed: {
      type: ["string", "null"],
      minLength: 1,
      maxLength: 500,
    },
    proposalCandidate: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "type",
            "targetMemoryItemId",
            "replacementStatement",
            "effectiveOn",
            "summary",
            "rationale",
          ],
          properties: {
            type: { type: "string", enum: ["memory_update"] },
            targetMemoryItemId: {
              type: "string",
              pattern:
                "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
            },
            replacementStatement: {
              type: "string",
              minLength: 1,
              maxLength: 1000,
            },
            effectiveOn: {
              type: ["string", "null"],
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
            summary: { type: "string", minLength: 1, maxLength: 240 },
            rationale: { type: "string", minLength: 1, maxLength: 1000 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "type",
            "title",
            "dueAt",
            "preferredDay",
            "durationMinutes",
            "summary",
            "rationale",
          ],
          properties: {
            type: { type: "string", enum: ["action_create"] },
            title: { type: "string", minLength: 1, maxLength: 200 },
            dueAt: {
              anyOf: [
                { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                {
                  type: "string",
                  pattern:
                    "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:\\d{2})$",
                },
                {
                  type: "string",
                  pattern:
                    "^(?:today|tomorrow|tonight|(?:this|next)_(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:T(?:[01]\\d|2[0-3]):[0-5]\\d)?$",
                },
                { type: "null" },
              ],
            },
            preferredDay: {
              type: ["string", "null"],
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
            durationMinutes: {
              type: ["integer", "null"],
              minimum: 1,
              maximum: 1440,
            },
            summary: { type: "string", minLength: 1, maxLength: 240 },
            rationale: { type: "string", minLength: 1, maxLength: 1000 },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;
