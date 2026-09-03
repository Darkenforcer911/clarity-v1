import { z } from "zod";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time.");

export const completedPlanEvidenceInputSchema = z.object({
  title: z.string().trim().min(1, "Describe what you completed.").max(200),
  completedTime: z.union([z.literal(""), timeSchema]).transform((value) =>
    value === "" ? null : value,
  ),
  actualMinutes: z.union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .int("Actual duration must be a whole number of minutes.")
      .min(1, "Actual duration must be at least 1 minute.")
      .max(1440, "Actual duration cannot exceed 24 hours."),
  ]),
  details: z
    .string()
    .trim()
    .max(2000, "Details must be 2000 characters or fewer.")
    .transform((value) => value || null),
});

export type CompletedPlanEvidenceInput = z.infer<
  typeof completedPlanEvidenceInputSchema
>;
