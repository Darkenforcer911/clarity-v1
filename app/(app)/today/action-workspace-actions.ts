"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";

import {
  addedActionNoticeDestination,
} from "@/lib/clarity/add-action-destination";
import type { DailyLoopActionState } from "@/lib/clarity/action-state";
import {
  ActionWorkspaceServiceError,
  actionWorkspaceService,
} from "@/lib/clarity/action-workspace-service";
import {
  actionNoteSchema,
  actionContextDecisionSchema,
  addActionSchema,
  changeActionTimeSchema,
  completionTimeCorrectionSchema,
  editActionSchema,
  taskAssistantQuestionSchema,
} from "@/lib/clarity/schemas";

function actionError(error: unknown): DailyLoopActionState {
  if (error instanceof ZodError) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  if (error instanceof ActionWorkspaceServiceError && error.field) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: {
        [error.field]: [error.message],
      },
    };
  }

  return {
    error: error instanceof Error ? error.message : "Something went wrong.",
  };
}

function actionFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    actionType: String(formData.get("actionType") ?? ""),
    estimatedMinutes: String(formData.get("estimatedMinutes") ?? ""),
    scheduledTime: String(formData.get("scheduledTime") ?? ""),
    dueLocalDate: String(formData.get("dueLocalDate") ?? ""),
    dueLocalTime: String(formData.get("dueLocalTime") ?? ""),
    reminderOffsets: formData.getAll("reminderOffsets"),
    details: String(formData.get("details") ?? ""),
    recurrencePattern: String(formData.get("recurrencePattern") ?? "none"),
    recurrenceDays: formData.getAll("recurrenceDays"),
    whyItExists: String(formData.get("whyItExists") ?? ""),
    definitionOfDone: String(formData.get("definitionOfDone") ?? ""),
    suggestedMethod: String(formData.get("suggestedMethod") ?? ""),
  };
}

function editableActionFields(formData: FormData) {
  const fields = actionFields(formData);
  if (!formData.has("context")) return fields;

  const context = String(formData.get("context") ?? "").trim();
  return {
    ...fields,
    whyItExists: context
      ? `Context: ${context}`
      : fields.whyItExists.startsWith("Context: ")
        ? "Added because it matters today."
        : fields.whyItExists,
  };
}

function addActionFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    actionType: String(formData.get("actionType") ?? ""),
    estimatedMinutes: String(formData.get("estimatedMinutes") ?? ""),
    scheduledTime: String(formData.get("scheduledTime") ?? ""),
    localDate: String(formData.get("localDate") ?? ""),
    dueLocalDate: String(formData.get("dueLocalDate") ?? ""),
    dueLocalTime: String(formData.get("dueLocalTime") ?? ""),
    reminderOffsets: formData.getAll("reminderOffsets"),
    details: String(formData.get("details") ?? ""),
    context: String(formData.get("context") ?? ""),
    clarificationQuestion: String(
      formData.get("clarificationQuestion") ?? "",
    ),
    clarificationAnswer: String(
      formData.get("clarificationAnswer") ?? "",
    ),
    recurrencePattern: String(
      formData.get("recurrencePattern") ?? "none",
    ),
    recurrenceDays: formData.getAll("recurrenceDays"),
  };
}

function addActionDraft(formData: FormData) {
  const input = addActionFields(formData);

  return {
    title: input.title,
    actionType: input.actionType,
    estimatedMinutes: input.estimatedMinutes,
    scheduledTime: input.scheduledTime,
    context: input.context,
    clarificationQuestion: input.clarificationQuestion,
    clarificationAnswer: input.clarificationAnswer,
    recurrencePattern: input.recurrencePattern,
    recurrenceDays: input.recurrenceDays
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    localDate: input.localDate,
    dueLocalDate: input.dueLocalDate,
    dueLocalTime: input.dueLocalTime,
    reminderOffsets: input.reminderOffsets
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 0),
    details: input.details,
  };
}

export async function addActionAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  if (!formData.has("title")) {
    return {
      error:
        "Couldn’t read the action details. Try closing and reopening this form.",
    };
  }

  let destination = "/today";
  const draft = addActionDraft(formData);

  try {
    const rawPlanId = String(formData.get("planId") ?? "");
    const planId = rawPlanId ? z.string().uuid().parse(rawPlanId) : null;
    const parsedInput = addActionSchema.safeParse(addActionFields(formData));

    if (!parsedInput.success) {
      return {
        ...actionError(parsedInput.error),
        addActionDraft: draft,
      };
    }

    const input = parsedInput.data;
    const submissionIntent = formData.get("submissionIntent");
    const result = await actionWorkspaceService.addAction(planId, input, {
      helpRequested: submissionIntent === "help_choose",
      timeDecision:
        submissionIntent === "shorten_time"
          ? "shorten"
          : submissionIntent === "move_tomorrow"
            ? "move_tomorrow"
            : submissionIntent === "add_anyway"
              ? "add_anyway"
              : undefined,
    });

    if (result.outcome === "needs_input") {
      return {
        error: null,
        addActionFeedback: result.feedback,
        addActionDraft: {
          title: input.title,
          actionType: input.actionType,
          estimatedMinutes: input.estimatedMinutes,
          scheduledTime: input.scheduledTime,
          context: input.context,
          clarificationQuestion: input.clarificationQuestion,
          clarificationAnswer: input.clarificationAnswer,
          recurrencePattern: input.recurrencePattern,
          recurrenceDays: input.recurrenceDays,
          localDate: input.localDate,
          dueLocalDate: input.dueLocalDate,
          dueLocalTime: input.dueLocalTime,
          reminderOffsets: input.reminderOffsets,
          details: input.details,
        },
      };
    }

    if (result.outcome === "validation_error") {
      return {
        error: "Check the highlighted fields and try again.",
        fieldErrors: result.fieldErrors,
        addActionDraft: draft,
      };
    }

    if (result.outcome === "time_warning") {
      return {
        error: null,
        addActionDraft: draft,
        addActionTimeWarning: result.warning,
      };
    }

    destination = formData.get("destination") === "calendar"
      ? `/calendar?date=${encodeURIComponent(result.localDate)}`
      : addedActionNoticeDestination(
          result.planStatus,
          input.actionType === "fixed" ? input.scheduledTime ?? "" : "",
        );
    revalidatePath("/today");
    revalidatePath("/today/active");
    revalidatePath("/today/plan");
    revalidatePath("/calendar");

    if (
      result.planStatus === "proposed" &&
      result.ongoingContextSuggestion &&
      result.actionId
    ) {
      return {
        error: null,
        addActionContextPrompt: {
          actionId: result.actionId,
          suggestion: result.ongoingContextSuggestion,
          destination,
        },
      };
    }
  } catch (error) {
    return {
      ...actionError(error),
      addActionDraft: draft,
    };
  }

  redirect(destination);
}

export async function decideActionContextAction(formData: FormData) {
  const input = actionContextDecisionSchema.parse({
    actionId: formData.get("actionId"),
    decision: formData.get("decision"),
    destination: formData.get("destination"),
  });

  await actionWorkspaceService.setContextDecision(
    input.actionId,
    input.decision,
  );
  revalidatePath("/today");
  revalidatePath("/today/plan");
  revalidatePath(`/today/actions/${input.actionId}`);
  redirect(input.destination);
}

export async function updateActionAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const actionId = z.string().uuid().parse(formData.get("actionId"));
    const input = editActionSchema.parse(editableActionFields(formData));
    await actionWorkspaceService.updateAction(actionId, input);
    revalidatePath("/today");
    revalidatePath("/today/plan");
    revalidatePath("/today/active");
    revalidatePath("/calendar");
    revalidatePath(`/today/actions/${actionId}`);
    return {
      error: null,
      success: "Action updated",
      updateSucceededAt: Date.now(),
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function changeActionTimeAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const actionId = z.string().uuid().parse(formData.get("actionId"));
    const input = changeActionTimeSchema.parse({
      actionType: formData.get("actionType"),
      estimatedMinutes: formData.get("estimatedMinutes"),
      scheduledTime: String(formData.get("scheduledTime") ?? ""),
    });
    await actionWorkspaceService.changeActionTime(actionId, input);
    revalidatePath("/today");
    revalidatePath(`/today/actions/${actionId}`);
    return { error: null, success: "Changes saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function correctCompletionTimeAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const actionId = z.string().uuid().parse(formData.get("actionId"));
    const input = completionTimeCorrectionSchema.parse({
      completionTime: String(formData.get("completionTime") ?? ""),
      timeUnknown: formData.get("timeUnknown") === "on",
    });

    await actionWorkspaceService.correctCompletionTime(actionId, input);
    revalidatePath("/today");
    revalidatePath(`/today/actions/${actionId}`);
    return { error: null, success: "Completion time updated." };
  } catch (error) {
    return {
      error: "Couldn’t update the completion time. Try again.",
      ...(error instanceof ZodError
        ? {
            fieldErrors: error.flatten().fieldErrors as Record<
              string,
              string[]
            >,
          }
        : error instanceof ActionWorkspaceServiceError && error.field
          ? { fieldErrors: { [error.field]: [error.message] } }
          : {}),
    };
  }
}

export async function removeProposedActionAction(formData: FormData) {
  const actionId = z.string().uuid().parse(formData.get("actionId"));
  await actionWorkspaceService.removeProposedAction(actionId);
  revalidatePath("/today/plan");
}

export async function removeProposedActionInlineAction(actionId: string) {
  try {
    const parsedActionId = z.string().uuid().parse(actionId);
    await actionWorkspaceService.removeProposedAction(parsedActionId);
    return { success: true as const, error: null };
  } catch (error) {
    return {
      success: false as const,
      error: actionError(error).error,
    };
  }
}

export async function reorderProposedActionsInlineAction(
  planId: string,
  orderedActionIds: string[],
) {
  try {
    const parsedPlanId = z.string().uuid().parse(planId);
    const parsedActionIds = z.array(z.string().uuid()).parse(
      orderedActionIds,
    );
    await actionWorkspaceService.reorderProposedActions(
      parsedPlanId,
      parsedActionIds,
    );
    revalidatePath("/today");
    revalidatePath("/today/plan");
    return { success: true as const, error: null };
  } catch (error) {
    console.error("Failed to reorder proposed daily actions", error);
    return {
      success: false as const,
      error: "Couldn’t save the new order. Try again.",
    };
  }
}

export async function restoreProposedActionInlineAction(actionId: string) {
  try {
    const parsedActionId = z.string().uuid().parse(actionId);
    await actionWorkspaceService.restoreSingleRemovedProposedAction(
      parsedActionId,
    );
    revalidatePath("/today");
    revalidatePath("/today/plan");
    return { success: true as const, error: null };
  } catch (error) {
    return {
      success: false as const,
      error: actionError(error).error,
    };
  }
}

export async function restoreRemovedProposedActionsAction(
  formData: FormData,
) {
  const planId = z.string().uuid().parse(formData.get("planId"));
  await actionWorkspaceService.restoreRemovedProposedActions(planId);
  revalidatePath("/today/plan");
}

export async function completeProposedActionAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const actionId = z.string().uuid().parse(formData.get("actionId"));
    await actionWorkspaceService.completeProposedAction(actionId);
    revalidatePath("/today");
    revalidatePath("/today/plan");
    return { error: null, success: "Action completed." };
  } catch (error) {
    return actionError(error);
  }
}

export async function makeProposedActionEasierAction(formData: FormData) {
  const actionId = z.string().uuid().parse(formData.get("actionId"));
  await actionWorkspaceService.makeProposedActionEasier(actionId);
  revalidatePath("/today/plan");
}

export async function moveProposedActionToTomorrowAction(
  formData: FormData,
) {
  const actionId = z.string().uuid().parse(formData.get("actionId"));
  await actionWorkspaceService.moveProposedActionToTomorrow(actionId);
  revalidatePath("/today/plan");
  revalidatePath("/today");
}

export async function logActionUpdateAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const input = actionNoteSchema.parse({
      actionId: formData.get("actionId"),
      note: formData.get("note"),
    });
    await actionWorkspaceService.logNote(input.actionId, input.note);
    revalidatePath(`/today/actions/${input.actionId}`);
    return { error: null, success: "Update saved." };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        error: null,
        fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    return {
      error: "Couldn’t save the update. Try again.",
    };
  }
}

export async function deleteActionUpdateAction(
  actionNoteId: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const noteId = z.string().uuid().parse(actionNoteId);
    const actionId = await actionWorkspaceService.deleteNote(noteId);
    revalidatePath(`/today/actions/${actionId}`);
    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Couldn’t delete the update. Try again.",
    };
  }
}

type ActiveActionMutationResult = {
  success: boolean;
  error: string | null;
  actionId: string | null;
};

export async function removeActionFromTodayAction(
  _previousState: ActiveActionMutationResult,
  formData: FormData,
): Promise<ActiveActionMutationResult> {
  let actionId: string;

  try {
    actionId = z.string().uuid().parse(formData.get("actionId"));
    await actionWorkspaceService.removeFromToday(actionId);
    revalidateActiveActionPaths(actionId);
  } catch {
    return {
      success: false,
      error: "Couldn’t remove the action from today. Try again.",
      actionId: null,
    };
  }

  redirect(`/today/active?notice=removed&actionId=${actionId}`);
}

export async function removeActionFromTodayInlineAction(
  actionId: string,
): Promise<ActiveActionMutationResult> {
  try {
    const parsedActionId = z.string().uuid().parse(actionId);
    await actionWorkspaceService.removeFromToday(parsedActionId);
    revalidateActiveActionPaths(parsedActionId);
    return {
      success: true,
      error: null,
      actionId: parsedActionId,
    };
  } catch {
    return {
      success: false,
      error: "Couldn’t remove the action from today. Try again.",
      actionId: null,
    };
  }
}

export async function removeActionOccurrenceAction(
  _previousState: ActiveActionMutationResult,
  formData: FormData,
): Promise<ActiveActionMutationResult> {
  try {
    const actionId = z.string().uuid().parse(formData.get("actionId"));
    await actionWorkspaceService.removeOccurrence(actionId);
    revalidateActiveActionPaths(actionId);
    return { success: true, error: null, actionId };
  } catch {
    return {
      success: false,
      error: "Couldn’t remove this Action. Try again.",
      actionId: null,
    };
  }
}

export async function removeActionOccurrenceInlineAction(
  actionId: string,
): Promise<ActiveActionMutationResult> {
  try {
    const parsedActionId = z.string().uuid().parse(actionId);
    await actionWorkspaceService.removeOccurrence(parsedActionId);
    revalidateActiveActionPaths(parsedActionId);
    return { success: true, error: null, actionId: parsedActionId };
  } catch {
    return {
      success: false,
      error: "Couldn’t remove this Action. Try again.",
      actionId: null,
    };
  }
}

export async function restoreActionToTodayAction(
  actionId: string,
): Promise<ActiveActionMutationResult> {
  try {
    const parsedActionId = z.string().uuid().parse(actionId);
    await actionWorkspaceService.restoreToToday(parsedActionId);
    revalidateActiveActionPaths(parsedActionId);
    return {
      success: true,
      error: null,
      actionId: parsedActionId,
    };
  } catch {
    return {
      success: false,
      error: "Couldn’t restore the action. Try again.",
      actionId: null,
    };
  }
}

function revalidateActiveActionPaths(actionId: string) {
  revalidatePath("/today");
  revalidatePath("/today/active");
  revalidatePath("/calendar");
  revalidatePath(`/today/actions/${actionId}`);
}

export async function askClarityAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const input = taskAssistantQuestionSchema.parse({
      actionId: formData.get("actionId"),
      question: formData.get("question"),
    });
    await actionWorkspaceService.askClarity(input.actionId, input.question);
    revalidatePath(`/today/actions/${input.actionId}`);
    return { error: null, success: "Clarity responded." };
  } catch (error) {
    return actionError(error);
  }
}

export async function applyClarityChangeAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  let redirectTo: string | null = null;

  try {
    const actionId = z.string().uuid().parse(formData.get("actionId"));
    const messageId = z.string().uuid().parse(formData.get("messageId"));
    const result = await actionWorkspaceService.applyAssistantRevision(
      actionId,
      messageId,
    );

    revalidatePath("/today");
    revalidatePath(`/today/actions/${actionId}`);

    if (result.destination === "today") {
      redirectTo = `/today?notice=${result.notice}`;
    } else {
      return { error: null, success: "Changes saved." };
    }
  } catch (error) {
    return actionError(error);
  }

  redirect(redirectTo ?? "/today");
}
