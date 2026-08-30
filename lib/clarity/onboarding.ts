import { z } from "zod";

export const ONBOARDING_VERSION = 1;
export const CURRENT_REALITY_QUESTION_ID = "current_reality_v1";

export const onboardingStepSchema = z.enum([
  "entry",
  "name",
  "name_welcome",
  "current_reality",
  "conversation_shell",
]);

export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

const identityDraftSchema = z.object({
  name: z.string().max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  city: z.string().max(120),
  country: z.string().max(120),
  timezone: z.string().max(100),
});

const responseDraftSchema = z.object({
  questionId: z.string().min(1).max(100),
  answer: z.string().max(10_000),
  explicitUnknown: z.boolean(),
  answeredAt: z.string().datetime().nullable(),
});

export const onboardingDraftSchema = z.object({
  version: z.literal(ONBOARDING_VERSION),
  identity: identityDraftSchema,
  responses: z.object({
    currentReality: responseDraftSchema,
  }),
  explicitUnknowns: z.array(z.string().max(100)),
  unconfirmedExtraction: z.record(z.string(), z.unknown()).nullable(),
});

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

export function emptyOnboardingDraft(input?: {
  name?: string | null;
  timezone?: string | null;
}): OnboardingDraft {
  return {
    version: ONBOARDING_VERSION,
    identity: {
      name: input?.name?.trim() ?? "",
      dateOfBirth: "",
      city: "",
      country: "",
      timezone: input?.timezone?.trim() || "UTC",
    },
    responses: {
      currentReality: {
        questionId: CURRENT_REALITY_QUESTION_ID,
        answer: "",
        explicitUnknown: false,
        answeredAt: null,
      },
    },
    explicitUnknowns: [],
    unconfirmedExtraction: null,
  };
}

export function parseOnboardingDraft(
  value: unknown,
  fallback?: { name?: string | null; timezone?: string | null },
) {
  const parsed = onboardingDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyOnboardingDraft(fallback);
}

export function parseOnboardingStep(value: unknown): OnboardingStep {
  if (value === "identity") return "name";
  if (value === "foundation_complete") return "conversation_shell";
  const parsed = onboardingStepSchema.safeParse(value);
  return parsed.success ? parsed.data : "entry";
}

export function isExplicitUnknown(value: string) {
  return /^(?:i\s+(?:do\s+not|don['’]?t)\s+know|not\s+sure|unsure)$/i.test(
    value.trim(),
  );
}
