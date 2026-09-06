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
  },
} as const;
