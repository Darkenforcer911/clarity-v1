import { z } from "zod";

import { progressExplanationError } from "./recap-validation";

export {
  shapeTodaySchema,
  type ShapeTodayInput,
} from "./shape-today-schema";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const actionTimingSchema = z.enum(["fixed", "flexible"]);

export const changeActionTimeSchema = z
  .object({
    actionType: actionTimingSchema,
    estimatedMinutes: z.coerce
      .number()
      .int("Use whole minutes.")
      .min(1, "Use at least 1 minute.")
      .max(1440, "Keep this within one day."),
    scheduledTime: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.actionType === "fixed" &&
      !localTimePattern.test(value.scheduledTime ?? "")
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a specific time.",
        path: ["scheduledTime"],
      });
    }
  });

export const completionTimeCorrectionSchema = z
  .object({
    completionTime: z.string().optional(),
    timeUnknown: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      !value.timeUnknown &&
      !localTimePattern.test(value.completionTime ?? "")
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a completion time or select Time not recorded.",
        path: ["completionTime"],
      });
    }
  });

const coreActionFieldsSchema = z
  .object({
    title: z.string().trim().min(1, "Enter what needs to be done.").max(200),
    actionType: actionTimingSchema,
    estimatedMinutes: z.coerce
      .number()
      .int("Use whole minutes.")
      .min(1, "Use at least 1 minute.")
      .max(1440, "Keep this within one day."),
    scheduledTime: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.actionType === "fixed" &&
      !localTimePattern.test(value.scheduledTime ?? "")
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a specific time.",
        path: ["scheduledTime"],
      });
    }
  });

export const addActionSchema = coreActionFieldsSchema
  .safeExtend({
    context: z
      .string()
      .trim()
      .max(990, "Keep this context under 990 characters."),
    clarificationQuestion: z
      .string()
      .trim()
      .max(500, "Keep this question under 500 characters.")
      .optional(),
    clarificationAnswer: z
      .string()
      .trim()
      .max(1000, "Keep this clarification under 1,000 characters.")
      .optional(),
    recurrencePattern: z.enum(["none", "daily", "weekly", "certain_days"]),
    recurrenceDays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
  })
  .superRefine((value, context) => {
    if (
      value.recurrencePattern === "certain_days" &&
      value.recurrenceDays.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one weekday.",
        path: ["recurrenceDays"],
      });
    }

    if (
      value.recurrencePattern !== "certain_days" &&
      value.recurrenceDays.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Weekdays only apply to Certain days.",
        path: ["recurrenceDays"],
      });
    }
  });

export const actionContextDecisionSchema = z.object({
  actionId: z.string().uuid(),
  decision: z.enum(["remembered", "once", "dismissed"]),
  destination: z
    .string()
    .regex(
      /^\/today(?:\/(?:plan|actions\/[0-9a-f-]+))?(?:\?notice=action-added(?:&time=(?:[01]\d|2[0-3])%3A[0-5]\d)?)?$/,
    ),
});

const actionFieldsSchema = coreActionFieldsSchema
  .safeExtend({
    whyItExists: z.string().trim().max(1000),
    definitionOfDone: z.string().trim().max(1000),
    suggestedMethod: z.string().trim().max(2000),
  });

export const editActionSchema = actionFieldsSchema.superRefine(
  (value, context) => {
    const requiredDetails = [
      ["whyItExists", value.whyItExists],
      ["definitionOfDone", value.definitionOfDone],
      ["suggestedMethod", value.suggestedMethod],
    ] as const;

    for (const [path, field] of requiredDetails) {
      if (!field) {
        context.addIssue({
          code: "custom",
          message: "Keep this detail clear and specific.",
          path: [path],
        });
      }
    }
  },
);

export const adaptActionSchema = editActionSchema
  .and(
    z.object({
      outcome: z.enum(["keep", "tomorrow", "choose_date", "drop"]),
      targetDate: z.string().optional(),
    }),
  )
  .superRefine((value, context) => {
    if (
      value.outcome === "choose_date" &&
      !localDatePattern.test(value.targetDate ?? "")
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a future date.",
        path: ["targetDate"],
      });
    }
  });

export const actionNoteSchema = z.object({
  actionId: z.string().uuid(),
  note: z.string().trim().min(1, "Write a short update.").max(2000),
});

export const taskAssistantQuestionSchema = z.object({
  actionId: z.string().uuid(),
  question: z
    .string()
    .trim()
    .min(1, "Ask a question about this action.")
    .max(2000),
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
  recordType: z
    .enum(["planned", "reconciled", "recorded_without_plan", "skipped"])
    .optional(),
  focus: z.string().min(1).nullable(),
  completedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  completedActions: z.array(
    summaryActionSchema.extend({
      completedAt: z.string().regex(timestampPattern).nullable().optional(),
      completionTimeUnknown: z.boolean().optional(),
      approximateMinutes: z
        .number()
        .int()
        .min(1)
        .max(1440)
        .nullable()
        .optional(),
    }),
  ),
  unfinishedActions: z.array(
    summaryActionSchema.extend({
      outcome: z.enum([
        "rescheduled",
        "dropped",
        "made_progress",
        "not_done",
        "closed",
        "resolved_elsewhere",
      ]),
      rescheduledFor: z.string().regex(localDatePattern).nullable(),
      progressLevel: z
        .enum(["started", "part_way_through", "nearly_finished", "blocked"])
        .nullable()
        .optional(),
      progressNote: z.string().max(500).nullable().optional(),
      notDoneNote: z.string().max(500).nullable().optional(),
      remainingWork: z.string().max(500).nullable().optional(),
      blockerNote: z.string().max(500).nullable().optional(),
      resolvedElsewhereNote: z
        .string()
        .max(500)
        .nullable()
        .optional(),
      closeReason: z
        .literal("removed_from_plan")
        .optional(),
      closeContext: z.string().max(500).nullable().optional(),
      approximateMinutes: z
        .number()
        .int()
        .min(1)
        .max(1440)
        .nullable()
        .optional(),
      approximateWorkTime: z
        .string()
        .regex(localTimePattern)
        .nullable()
        .optional(),
      recordedAt: z.string().regex(timestampPattern).optional(),
      linkedContextLabel: z.string().max(200).nullable().optional(),
      linkedContextKind: z.string().max(50).nullable().optional(),
    }),
  ),
  actionProgress: z
    .array(
      z.object({
        actionId: z.string().uuid(),
        title: z.string().min(1).max(200),
        progressLevel: z
          .enum([
            "started",
            "part_way_through",
            "nearly_finished",
            "blocked",
          ])
          .nullable(),
        note: z.string().max(500).nullable(),
      }),
    )
    .optional(),
  unplannedProgress: z
    .array(
      z.union([
        z.string().trim().min(1).max(500),
        z.object({
          title: z.string().trim().min(1).max(200),
          outcome: z.enum(["finished", "made_progress"]),
          completedAt: z
            .string()
            .regex(timestampPattern)
            .nullable()
            .optional(),
          completionRecordedAt: z
            .string()
            .regex(timestampPattern)
            .optional(),
          completionTimeUnknown: z.boolean().optional(),
          estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
          progressLevel: z
            .enum([
              "started",
              "part_way_through",
              "nearly_finished",
              "blocked",
            ])
            .nullable()
            .optional(),
          progressNote: z.string().max(500).nullable().optional(),
          approximateWorkTime: z
            .string()
            .regex(localTimePattern)
            .nullable()
            .optional(),
          remainingWork: z.string().max(500).nullable().optional(),
          blockerNote: z.string().max(500).nullable().optional(),
          occurredOn: z
            .string()
            .regex(localDatePattern)
            .optional(),
          recordedAt: z.string().regex(timestampPattern).optional(),
          carryoverCandidate: z.boolean().optional(),
        }),
      ]),
    )
    .optional(),
  contextSummary: z.string().trim().max(1000).nullable().optional(),
  ongoingContextCandidate: z
    .object({
      label: z.string().trim().min(1).max(100),
      sourceText: z.string().trim().min(1).max(500),
      decision: z
        .enum(["remembered", "once", "dismissed"])
        .nullable()
        .optional(),
      decidedAt: z.string().regex(timestampPattern).optional(),
    })
    .nullable()
    .optional(),
  explanation: z.string().nullable().optional(),
  recordedAt: z.string().regex(timestampPattern),
});

export const previousDayExplanationSchema = z
  .string()
  .trim()
  .min(1, "Tell Clarity what happened.")
  .max(5000, "Keep this under 5,000 characters.");

export const previousDayContextSchema = z
  .string()
  .trim()
  .max(5000, "Keep this under 5,000 characters.");

export const recapContextSummarySchema = z
  .string()
  .trim()
  .max(1000, "Keep this context under 1,000 characters.");

export const returnGapInputSchema = z
  .object({
    contextSummary: z
      .string()
      .trim()
      .max(2000, "Keep this context under 2,000 characters."),
    nothingImportant: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.nothingImportant && value.contextSummary) {
      context.addIssue({
        code: "custom",
        message: "Clear the context or continue with it.",
        path: ["contextSummary"],
      });
    }

    if (!value.nothingImportant && !value.contextSummary) {
      context.addIssue({
        code: "custom",
        message:
          "Add context or choose Nothing important happened.",
        path: ["contextSummary"],
      });
    }
  });

export const previousDayResolutionSchema = z
  .object({
    actionId: z.string().uuid(),
    outcome: z.enum([
      "finished",
      "made_progress",
      "not_done",
      "closed",
      "resolved_elsewhere",
    ]),
    completedAt: z.string().regex(timestampPattern).optional(),
    completionCorrected: z.boolean().optional(),
    approximateMinutes: z.number().int().min(1).max(1440).optional(),
    progressNote: z.string().trim().max(500).optional(),
    notDoneNote: z.string().max(500).optional(),
    closeReason: z
      .literal("removed_from_plan")
      .optional(),
    closeContext: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    const progressError =
      value.outcome === "made_progress"
        ? progressExplanationError(value.progressNote ?? "")
        : null;

    if (progressError) {
      context.addIssue({
        code: "custom",
        message: progressError,
        path: ["progressNote"],
      });
    }

    if (value.outcome !== "finished" && value.completedAt) {
      context.addIssue({
        code: "custom",
        message: "Completion time only applies to Done.",
        path: ["completedAt"],
      });
    }

    if (
      value.approximateMinutes !== undefined &&
      value.outcome !== "finished" &&
      value.outcome !== "made_progress"
    ) {
      context.addIssue({
        code: "custom",
        message: "Actual duration only applies to Done or Some progress.",
        path: ["approximateMinutes"],
      });
    }

    if (value.outcome !== "not_done" && value.notDoneNote) {
      context.addIssue({
        code: "custom",
        message: "Task context only applies when it didn’t happen.",
        path: ["notDoneNote"],
      });
    }

    if (
      value.outcome === "not_done" &&
      !value.notDoneNote?.trim()
    ) {
      context.addIssue({
        code: "custom",
        message: "Add what happened before confirming.",
        path: ["notDoneNote"],
      });
    }

    if (value.outcome === "closed" && !value.closeReason) {
      context.addIssue({
        code: "custom",
        message: "Choose why this action is closed.",
        path: ["closeReason"],
      });
    }

    if (value.outcome === "closed" && !value.closeContext) {
      context.addIssue({
        code: "custom",
        message: "Add why this action is no longer needed.",
        path: ["closeContext"],
      });
    }

    if (
      value.outcome !== "closed" &&
      (value.closeReason || value.closeContext)
    ) {
      context.addIssue({
        code: "custom",
        message: "Closure details only apply to Closed.",
        path: ["closeReason"],
      });
    }

  });

export const previousDayUnplannedWorkInputSchema = z
  .object({
    title: z.string().trim().min(1, "Enter what you did.").max(200),
    outcome: z.enum(["finished", "made_progress"]),
    completionTime: z.string().optional(),
    timeUnknown: z.boolean(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
    progressNote: z.string().trim().max(500).optional(),
    remainingWork: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.outcome === "finished" &&
      !value.timeUnknown &&
      !localTimePattern.test(value.completionTime ?? "")
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose when it finished or select Time not recorded.",
        path: ["completionTime"],
      });
    }

    if (value.outcome === "made_progress") {
      const error = progressExplanationError(value.progressNote ?? "");

      if (error) {
        context.addIssue({
          code: "custom",
          message: error,
          path: ["progressNote"],
        });
      }
    }
  });

export const previousDayUnplannedWorkSchema = z.object({
  title: z.string().trim().min(1).max(200),
  outcome: z.enum(["finished", "made_progress"]),
  completedAt: z.string().regex(timestampPattern).optional(),
  completionTimeUnknown: z.boolean(),
  estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
  progressNote: z.string().trim().max(500).optional(),
  remainingWork: z.string().trim().max(500).optional(),
});

export type AddActionInput = z.infer<typeof addActionSchema>;
export type ChangeActionTimeInput = z.infer<typeof changeActionTimeSchema>;
export type CompletionTimeCorrectionInput = z.infer<
  typeof completionTimeCorrectionSchema
>;
export type EditActionInput = z.infer<typeof editActionSchema>;
export type AdaptActionInput = z.infer<typeof adaptActionSchema>;
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
export type CloseDayResolution = z.infer<typeof closeDayResolutionSchema>;
export type DaySummary = z.infer<typeof daySummarySchema>;
export type PreviousDayResolution = z.infer<
  typeof previousDayResolutionSchema
>;
export type ReturnGapInput = z.infer<typeof returnGapInputSchema>;
export type PreviousDayUnplannedWork = z.infer<
  typeof previousDayUnplannedWorkSchema
>;
