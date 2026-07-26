import { z } from "zod";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const shapeTodaySchema = z
  .object({
    wokeAt: z.string().regex(localTimePattern, "Enter a valid wake time."),
    aimingToSleepAt: z
      .string()
      .regex(localTimePattern, "Enter a valid sleep time."),
    contextForToday: z.string().trim().max(2000, "Keep this under 2,000 characters."),
    nothingElseToday: z.boolean(),
  })
  .superRefine((value, context) => {
    if (!value.nothingElseToday && value.contextForToday.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Add some context or choose Nothing else today.",
        path: ["contextForToday"],
      });
    }

    if (value.nothingElseToday && value.contextForToday.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Clear the context or turn off Nothing else today.",
        path: ["contextForToday"],
      });
    }
  });

export const generatedActionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  actionType: z.enum(["fixed", "flexible"]),
  estimatedMinutes: z.number().int().min(1).max(1440),
  scheduledTime: z.string().regex(localTimePattern).nullable(),
  whyItExists: z.string().trim().min(1).max(1000),
  definitionOfDone: z.string().trim().min(1).max(1000),
  suggestedMethod: z.string().trim().min(1).max(2000),
  status: z.literal("proposed"),
  sortOrder: z.number().int().nonnegative(),
});

export const generatedPlanSchema = z
  .object({
    focus: z.string().trim().min(1).max(500),
    actions: z.array(generatedActionSchema).min(1).max(12),
  })
  .superRefine((plan, context) => {
    const ids = new Set(plan.actions.map((action) => action.id));
    const sortOrders = new Set(plan.actions.map((action) => action.sortOrder));

    if (ids.size !== plan.actions.length) {
      context.addIssue({
        code: "custom",
        message: "Generated action IDs must be unique.",
        path: ["actions"],
      });
    }

    if (sortOrders.size !== plan.actions.length) {
      context.addIssue({
        code: "custom",
        message: "Generated action sort orders must be unique.",
        path: ["actions"],
      });
    }
  });

export const closeDayResolutionSchema = z
  .object({
    actionId: z.string().uuid(),
    outcome: z.enum(["tomorrow", "choose_date", "drop"]),
    selectedDate: z
      .string()
      .regex(localDatePattern, "Choose a valid date.")
      .optional(),
    resolutionNote: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    if (value.outcome === "choose_date" && !value.selectedDate) {
      context.addIssue({
        code: "custom",
        message: "Choose a date for this action.",
        path: ["selectedDate"],
      });
    }
  });

const summaryActionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
});

export const daySummarySchema = z.object({
  version: z.literal(1),
  dailyPlanId: z.string().uuid(),
  localDate: z.string().regex(localDatePattern),
  focus: z.string().min(1),
  completedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  completedActions: z.array(summaryActionSchema),
  unfinishedActions: z.array(
    summaryActionSchema.extend({
      outcome: z.enum(["rescheduled", "dropped"]),
      rescheduledFor: z.string().regex(localDatePattern).nullable(),
    }),
  ),
  recordedAt: z.string().regex(timestampPattern),
});

export type ShapeTodayInput = z.infer<typeof shapeTodaySchema>;
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
export type CloseDayResolution = z.infer<typeof closeDayResolutionSchema>;
export type DaySummary = z.infer<typeof daySummarySchema>;
