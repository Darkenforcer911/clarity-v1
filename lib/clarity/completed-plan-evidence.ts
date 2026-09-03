import { z } from "zod";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time.");

export const completedPlanEvidenceInputSchema = z
  .object({
    title: z.string().trim().min(1, "Describe what you completed.").max(200),
    completedTime: z.union([z.literal(""), timeSchema]).transform((value) =>
      value === "" ? null : value,
    ),
    actualMinutes: z.union([
      z.literal("").transform(() => null),
      z.coerce
        .number()
        .int("Duration must be a whole number of minutes.")
        .min(1, "Duration must be at least 1 minute.")
        .max(1440, "Duration cannot exceed 24 hours."),
    ]),
    dueLocalDate: z
      .union([z.literal(""), z.iso.date()])
      .default("")
      .transform((value) => (value === "" ? null : value)),
    dueLocalTime: z
      .union([z.literal(""), timeSchema])
      .default("")
      .transform((value) => (value === "" ? null : value)),
    recurrencePattern: z
      .enum(["none", "daily", "weekly", "certain_days"])
      .default("none"),
    recurrenceDays: z
      .array(z.coerce.number().int().min(0).max(6))
      .max(7)
      .default([]),
    reminderOffsets: z
      .array(z.coerce.number().int().min(0).max(43_200))
      .max(10)
      .default([]),
    details: z
      .string()
      .trim()
      .max(2000, "Details must be 2000 characters or fewer.")
      .default("")
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (value.dueLocalTime && !value.dueLocalDate) {
      context.addIssue({
        code: "custom",
        message: "Choose a due date before adding a due time.",
        path: ["dueLocalDate"],
      });
    }
    if (value.recurrencePattern === "certain_days" && value.recurrenceDays.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one weekday.",
        path: ["recurrenceDays"],
      });
    }
    if (value.recurrencePattern !== "certain_days" && value.recurrenceDays.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Weekdays only apply to Certain days.",
        path: ["recurrenceDays"],
      });
    }
    if (value.recurrencePattern !== "none" && value.actualMinutes === null) {
      context.addIssue({
        code: "custom",
        message: "Add Duration before making completed activity repeat.",
        path: ["actualMinutes"],
      });
    }
    if (
      value.reminderOffsets.length > 0 &&
      (value.recurrencePattern === "none" || !value.dueLocalTime)
    ) {
      context.addIssue({
        code: "custom",
        message: "Reminders need a repeating Action with an exact Due time.",
        path: ["reminderOffsets"],
      });
    }
  });

export type CompletedPlanEvidenceInput = z.infer<
  typeof completedPlanEvidenceInputSchema
>;
