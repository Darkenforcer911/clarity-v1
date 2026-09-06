import "server-only";

import {
  addLocalDays,
  getLocalDate,
  getLocalTime,
  getNextRecurrenceDate,
  localDateTimeToIso,
} from "./date-time";
import {
  adaptActionSchema,
  addActionSchema,
  completionTimeCorrectionSchema,
  editActionSchema,
  taskAssistantQuestionSchema,
  type AdaptActionInput,
  type AddActionInput,
  type ChangeActionTimeInput,
  type CompletionTimeCorrectionInput,
  type EditActionInput,
} from "./schemas";
import {
  getActionWorkspaceData,
  getAuthenticatedUserAndProfile,
  type DailyPlan,
} from "./daily-loop-queries";
import {
  encodeTaskAssistantResponse,
  parseTaskAssistantContent,
  type TaskAssistant,
} from "./ai/task-assistant";
import type { ActionInputValidator } from "./ai/action-input-validator";
import { MockActionInputValidator } from "./ai/mock-action-input-validator";
import type { ActionContextLinker } from "./ai/action-context-linker";
import { MockActionContextLinker } from "./ai/mock-action-context-linker";
import { MockTaskAssistant } from "./ai/mock-task-assistant";

export class ActionWorkspaceServiceError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ActionWorkspaceServiceError";
  }
}

function ensureRpcSucceeded(error: { message: string } | null) {
  if (error) {
    throw new ActionWorkspaceServiceError(error.message);
  }
}

async function callPendingActionWorkspaceRpc(
  supabase: { rpc: unknown },
  functionName:
    | "adapt_daily_action"
    | "correct_action_completion_time"
    | "complete_proposed_action"
    | "delete_action_note"
    | "replace_active_action"
    | "reorder_proposed_daily_actions"
    | "restore_action_to_today"
    | "restore_removed_proposed_actions"
    | "update_daily_action",
  args: Record<string, unknown>,
) {
  const rpc = supabase.rpc as (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;

  return rpc.call(supabase, functionName, args);
}

export class ActionWorkspaceService {
  constructor(
    private readonly taskAssistant: TaskAssistant = new MockTaskAssistant(),
    private readonly actionInputValidator: ActionInputValidator =
      new MockActionInputValidator(),
    private readonly actionContextLinker: ActionContextLinker =
      new MockActionContextLinker(),
  ) {}

  getAction(actionId: string) {
    return getActionWorkspaceData(actionId);
  }

  async addAction(
    planId: string | null,
    rawInput: AddActionInput,
    options: {
      helpRequested?: boolean;
      timeDecision?: "shorten" | "move_tomorrow" | "add_anyway";
    } = {},
  ) {
    const input = addActionSchema.parse(rawInput);
    const { supabase, user, profile } =
      await getAuthenticatedUserAndProfile();
    const planResult = planId
      ? await supabase
          .from("daily_plans")
          .select("*")
          .eq("id", planId)
          .eq("user_id", user.id)
          .single()
      : { data: null, error: null };
    const plan = planResult.data;
    const requestedLocalDate = plan?.local_date ?? input.localDate;

    if (planResult.error || (planId && !plan)) {
      throw new ActionWorkspaceServiceError(
        planResult.error?.message ?? "Daily plan not found.",
      );
    }

    if (!requestedLocalDate) {
      throw new ActionWorkspaceServiceError("Choose when this Action belongs.");
    }

    if (plan && plan.local_date !== getLocalDate(profile.timezone)) {
      throw new ActionWorkspaceServiceError(
        "Today has changed. Return to Today before adding an action.",
      );
    }

    const validation = await this.actionInputValidator.validate({
      title: input.title,
      clarificationQuestion: input.clarificationQuestion,
      clarificationAnswer: input.clarificationAnswer,
      context: input.context,
      planFocus: plan?.focus ?? null,
      helpRequested: options.helpRequested,
    });

    if (validation.classification !== "actionable") {
      return {
        outcome: "needs_input" as const,
        feedback: {
          classification: validation.classification,
          message:
            validation.classification === "ambiguous"
              ? validation.exhausted
                ? "I still don’t have enough detail to create this action."
                : (validation.clarification ?? "")
              : validation.message,
          originalInput: input.title,
          clarificationQuestion:
            validation.classification === "ambiguous" &&
            !validation.exhausted
              ? (validation.clarification ?? undefined)
              : input.clarificationQuestion,
          exhausted:
            validation.classification === "ambiguous"
              ? validation.exhausted
              : false,
        },
      };
    }

    let actionableInput = {
      ...input,
      title: validation.normalizedTitle,
    };
    const timing = resolveNewActionTiming(
      actionableInput,
      {
        local_date: requestedLocalDate,
        aiming_to_sleep_at: plan?.aiming_to_sleep_at ?? null,
      },
      profile.timezone,
      options.timeDecision,
    );

    if (timing.outcome === "validation_error") {
      return {
        outcome: "validation_error" as const,
        fieldErrors: {
          scheduledTime: [timing.message],
        },
      };
    }

    if (timing.outcome === "warning") {
      return {
        outcome: "time_warning" as const,
        warning: {
          message: "This may run past your planned sleep time." as const,
          shortenedMinutes: timing.shortenedMinutes,
        },
      };
    }

    actionableInput = {
      ...actionableInput,
      estimatedMinutes: timing.estimatedMinutes,
    };
    const { data: rememberedRows, error: rememberedError } = await supabase
      .from("daily_actions")
      .select("ongoing_context_suggestion")
      .eq("user_id", user.id)
      .eq("ongoing_context_decision", "remembered")
      .not("ongoing_context_suggestion", "is", null)
      .limit(50);

    if (rememberedError) {
      throw new ActionWorkspaceServiceError(rememberedError.message);
    }

    const contextLink = await this.actionContextLinker.link({
      title: actionableInput.title,
      context: actionableInput.context,
      recurrencePattern: actionableInput.recurrencePattern,
      rememberedContexts: rememberedRows
        .map((row) => row.ongoing_context_suggestion)
        .filter((value): value is string => Boolean(value)),
    });
    const occurrenceDate = timing.startOn ?? requestedLocalDate;
    const dueLocalDate =
      actionableInput.dueLocalDate &&
      actionableInput.recurrencePattern !== "none" &&
      occurrenceDate !== requestedLocalDate
        ? addLocalDays(
            actionableInput.dueLocalDate,
            localDayDistance(requestedLocalDate, occurrenceDate),
          )
        : actionableInput.dueLocalDate;
    const { data: actionId, error } = await supabase.rpc("create_action_occurrence_v1", {
      p_local_date: occurrenceDate,
      ...(plan ? { p_daily_plan_id: plan.id } : {}),
      p_title: actionableInput.title,
      p_duration_minutes: actionableInput.estimatedMinutes,
      p_when_time: actionableInput.scheduledTime || undefined,
      p_due_local_date: dueLocalDate || undefined,
      p_due_local_time: actionableInput.dueLocalTime || undefined,
      p_reminder_offsets_minutes: actionableInput.reminderOffsets,
      p_details: actionableInput.details || undefined,
      p_recurrence_pattern: input.recurrencePattern,
      p_recurrence_days: input.recurrenceDays,
      p_linked_context_label: contextLink.relationship?.label,
      p_linked_context_kind: contextLink.relationship?.kind,
      p_ongoing_context_suggestion:
        contextLink.ongoingSuggestion ?? undefined,
    });

    ensureRpcSucceeded(error);

    return {
      outcome: "saved" as const,
      planStatus: plan?.status ?? "proposed",
      localDate: occurrenceDate,
      actionId,
      ongoingContextSuggestion: contextLink.ongoingSuggestion,
    };
  }

  async setContextDecision(
    actionId: string,
    decision: "remembered" | "once" | "dismissed",
  ) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("set_action_context_decision", {
      p_daily_action_id: actionId,
      p_decision: decision,
    });

    ensureRpcSucceeded(error);
  }

  async updateAction(actionId: string, rawInput: EditActionInput) {
    const input = editActionSchema.parse(rawInput);
    const data = await this.getAction(actionId);
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("update_action_occurrence_v1", {
      p_daily_action_id: data.action.id,
      p_title: input.title,
      p_duration_minutes: input.estimatedMinutes,
      p_when_time: input.scheduledTime || undefined,
      p_due_local_date: input.dueLocalDate || undefined,
      p_due_local_time: input.dueLocalTime || undefined,
      p_reminder_offsets_minutes: input.reminderOffsets,
      p_details: input.details || undefined,
      p_recurrence_pattern: input.recurrencePattern,
      p_recurrence_days: input.recurrenceDays,
    });

    ensureRpcSucceeded(error);
  }

  async updateProposedAction(
    actionId: string,
    rawInput: EditActionInput,
  ) {
    const data = await this.getAction(actionId);
    if (
      (data.plan !== null && data.plan.status !== "proposed") ||
      data.action.status !== "proposed"
    ) {
      throw new ActionWorkspaceServiceError(
        "Only a proposed action can be edited directly.",
      );
    }

    await this.updateAction(actionId, rawInput);
  }

  async reorderProposedActions(planId: string, orderedActionIds: string[]) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callPendingActionWorkspaceRpc(
      supabase,
      "reorder_proposed_daily_actions",
      {
        p_daily_plan_id: planId,
        p_ordered_action_ids: orderedActionIds,
      },
    );

    ensureRpcSucceeded(error);
  }

  async changeActionTime(
    actionId: string,
    input: ChangeActionTimeInput,
  ) {
    const data = await this.getAction(actionId);

    if (data.action.local_date !== getLocalDate(data.profile.timezone)) {
      throw new ActionWorkspaceServiceError(
        "Today has changed. Return to Today before changing this action.",
      );
    }

    if (input.actionType === "fixed" && input.scheduledTime) {
      const proposedTime = localDateTimeToIso(
        data.action.local_date,
        input.scheduledTime,
        data.profile.timezone,
      );
      const existingOverdueTime =
        data.action.status === "active" &&
        data.action.scheduled_time !== null &&
        new Date(data.action.scheduled_time).getTime() <= Date.now() &&
        Math.abs(
          new Date(data.action.scheduled_time).getTime() -
            new Date(proposedTime).getTime(),
        ) < 1000;

      if (new Date(proposedTime).getTime() <= Date.now() && !existingOverdueTime) {
        throw new ActionWorkspaceServiceError(
          "That time has already passed. Choose a later time or remove the time.",
          "scheduledTime",
        );
      }
    }

    await this.updateAction(actionId, {
      title: data.action.title,
      actionType: input.actionType,
      estimatedMinutes: input.estimatedMinutes,
      scheduledTime: input.scheduledTime,
      dueLocalDate: data.action.due_local_date ?? "",
      dueLocalTime: data.action.due_local_time?.slice(0, 5) ?? "",
      reminderOffsets: data.action.reminder_offsets_minutes,
      recurrencePattern: recurrencePatternFor(data.lifeContext.routine),
      recurrenceDays: data.lifeContext.routine?.weekdays ?? [],
      details: data.action.details ?? "",
      whyItExists: data.action.why_it_exists,
      definitionOfDone: data.action.definition_of_done,
      suggestedMethod: data.action.suggested_method,
    });
  }

  async correctCompletionTime(
    actionId: string,
    rawInput: CompletionTimeCorrectionInput,
  ) {
    const input = completionTimeCorrectionSchema.parse(rawInput);
    const data = await this.getAction(actionId);
    const plan = requireActionPlan(data.plan);

    const correctableCurrentPlan =
      plan.status === "active" ||
      (plan.status === "proposed" &&
        plan.approved_at === null &&
        data.action.approved_at === null);

    if (
      !correctableCurrentPlan ||
      data.action.local_date !== getLocalDate(data.profile.timezone) ||
      data.action.status !== "completed" ||
      data.action.completion_evidence_only
    ) {
      throw new ActionWorkspaceServiceError(
        "Completion time can only be corrected for a completed Action today.",
      );
    }

    let completedAt: string | null = null;

    if (!input.timeUnknown && input.completionTime) {
      completedAt = localDateTimeToIso(
        data.action.local_date,
        input.completionTime,
        data.profile.timezone,
      );

      if (new Date(completedAt).getTime() > Date.now()) {
        throw new ActionWorkspaceServiceError(
          "Completion time cannot be in the future.",
          "completionTime",
        );
      }
    }

    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callPendingActionWorkspaceRpc(
      supabase,
      "correct_action_completion_time",
      {
        p_daily_action_id: data.action.id,
        p_completed_at: completedAt,
        p_time_unknown: input.timeUnknown,
      },
    );

    ensureRpcSucceeded(error);
  }

  async removeProposedAction(actionId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("remove_proposed_action", {
      p_daily_action_id: actionId,
    });

    ensureRpcSucceeded(error);
  }

  async restoreRemovedProposedActions(planId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { data, error } = await callPendingActionWorkspaceRpc(
      supabase,
      "restore_removed_proposed_actions",
      { p_daily_plan_id: planId },
    );

    ensureRpcSucceeded(error);
    return Number(data ?? 0);
  }

  async restoreSingleRemovedProposedAction(actionId: string) {
    const { supabase, user } = await getAuthenticatedUserAndProfile();
    const { data: action, error: actionError } = await supabase
      .from("daily_actions")
      .select("id, daily_plan_id, status, approved_at")
      .eq("id", actionId)
      .eq("user_id", user.id)
      .single();

    if (actionError || !action) {
      throw new ActionWorkspaceServiceError(
        actionError?.message ?? "Removed action not found.",
      );
    }

    if (action.status !== "removed" || action.approved_at !== null) {
      throw new ActionWorkspaceServiceError(
        "Only a removed action from the current proposal can be restored.",
      );
    }

    if (!action.daily_plan_id) {
      throw new ActionWorkspaceServiceError(
        "This Action is not part of a proposed plan.",
      );
    }

    const { data: plan, error: planError } = await supabase
      .from("daily_plans")
      .select("status")
      .eq("id", action.daily_plan_id)
      .eq("user_id", user.id)
      .single();

    if (planError || !plan || plan.status !== "proposed") {
      throw new ActionWorkspaceServiceError(
        planError?.message ?? "Only the current proposal can be restored.",
      );
    }

    const { data: removedActions, error: removedActionsError } = await supabase
      .from("daily_actions")
      .select("id")
      .eq("daily_plan_id", action.daily_plan_id)
      .eq("user_id", user.id)
      .eq("status", "removed")
      .is("approved_at", null);

    if (removedActionsError) {
      throw new ActionWorkspaceServiceError(removedActionsError.message);
    }

    const { error: restoreError } = await callPendingActionWorkspaceRpc(
      supabase,
      "restore_removed_proposed_actions",
      { p_daily_plan_id: action.daily_plan_id },
    );
    ensureRpcSucceeded(restoreError);

    for (const removedAction of removedActions ?? []) {
      if (removedAction.id === actionId) continue;
      const { error } = await supabase.rpc("remove_proposed_action", {
        p_daily_action_id: removedAction.id,
      });
      ensureRpcSucceeded(error);
    }
  }

  async completeProposedAction(actionId: string) {
    const data = await this.getAction(actionId);
    const plan = requireActionPlan(data.plan);

    if (
      plan.status !== "proposed" ||
      data.action.status !== "proposed" ||
      data.action.completion_evidence_only
    ) {
      throw new ActionWorkspaceServiceError(
        "Only an unfinished action in the current proposed plan can be completed.",
      );
    }

    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callPendingActionWorkspaceRpc(
      supabase,
      "complete_proposed_action",
      { p_daily_action_id: actionId },
    );

    ensureRpcSucceeded(error);
  }

  async makeProposedActionEasier(actionId: string) {
    const data = await this.getAction(actionId);
    const plan = requireActionPlan(data.plan);

    if (
      plan.status !== "proposed" ||
      data.action.status !== "proposed"
    ) {
      throw new ActionWorkspaceServiceError(
        "Only a proposed action can be made easier.",
      );
    }

    const easierMinutes = Math.max(
      5,
      Math.min(
        data.action.estimated_minutes - 1,
        Math.round((data.action.estimated_minutes * 0.6) / 5) * 5,
      ),
    );
    const input = editActionSchema.parse({
      title: easierTitle(data.action.title),
      actionType: data.action.action_type,
      estimatedMinutes: easierMinutes,
      scheduledTime:
        data.action.action_type === "fixed" && data.action.scheduled_time
          ? localTimeFor(
              data.action.scheduled_time,
              data.profile.timezone,
            )
          : "",
      whyItExists: data.action.why_it_exists,
      definitionOfDone: `One useful part of “${data.action.title}” is finished and saved or recorded.`,
      suggestedMethod: `Choose the smallest useful part, work on it for ${easierMinutes} minutes, then save or record the result.`,
    });

    await this.updateAction(actionId, input);
  }

  async moveProposedActionToTomorrow(actionId: string) {
    const data = await this.getAction(actionId);
    const plan = requireActionPlan(data.plan);
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("reschedule_proposed_action", {
      p_daily_action_id: data.action.id,
      p_target_date: addLocalDays(plan.local_date, 1),
    });

    ensureRpcSucceeded(error);
  }

  async adaptAction(actionId: string, rawInput: AdaptActionInput) {
    const input = adaptActionSchema.parse(rawInput);
    const data = await this.getAction(actionId);
    const plan = requireActionPlan(data.plan);
    let targetDate: string | null = null;

    if (input.outcome === "tomorrow") {
      targetDate = addLocalDays(plan.local_date, 1);
    } else if (input.outcome === "choose_date") {
      targetDate = input.targetDate ?? null;
    }

    if (targetDate && targetDate <= plan.local_date) {
      throw new ActionWorkspaceServiceError("Choose a future date.");
    }

    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callPendingActionWorkspaceRpc(
      supabase,
      "adapt_daily_action",
      {
        p_daily_action_id: data.action.id,
        ...rpcActionFields(
          input,
          plan.local_date,
          data.profile.timezone,
        ),
        p_outcome:
          input.outcome === "tomorrow" ||
          input.outcome === "choose_date"
            ? "reschedule"
            : input.outcome,
        ...(targetDate ? { p_target_date: targetDate } : {}),
      },
    );

    ensureRpcSucceeded(error);
  }

  async logNote(actionId: string, note: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("log_action_note", {
      p_daily_action_id: actionId,
      p_note: note,
    });

    ensureRpcSucceeded(error);
  }

  async deleteNote(noteId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { data, error } = await callPendingActionWorkspaceRpc(
      supabase,
      "delete_action_note",
      {
        p_action_note_id: noteId,
      },
    );

    ensureRpcSucceeded(error);

    if (typeof data !== "string") {
      throw new ActionWorkspaceServiceError(
        "Couldn’t identify the updated action.",
      );
    }

    return data;
  }

  async removeFromToday(actionId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("remove_action_from_today", {
      p_daily_action_id: actionId,
    });

    ensureRpcSucceeded(error);
  }

  async removeOccurrence(actionId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("remove_action_occurrence_v1", {
      p_daily_action_id: actionId,
    });

    ensureRpcSucceeded(error);
  }

  async changeRepeat(
    actionId: string,
    cadence: "daily" | "weekly" | "certain_days",
    weekdays: number[],
  ) {
    const data = await this.getAction(actionId);
    if (!data.action.source_routine_id) {
      throw new ActionWorkspaceServiceError(
        "This Action does not have a repeating series.",
      );
    }

    if (
      (cadence === "certain_days" && weekdays.length === 0) ||
      (cadence !== "certain_days" && weekdays.length > 0)
    ) {
      throw new ActionWorkspaceServiceError(
        "Choose at least one weekday for a custom repeat.",
        "recurrenceDays",
      );
    }

    const { supabase, user } = await getAuthenticatedUserAndProfile();
    const { data: routine, error: routineError } = await supabase
      .from("routines")
      .select("*")
      .eq("id", data.action.source_routine_id)
      .eq("user_id", user.id)
      .single();

    if (routineError || !routine || routine.status !== "active") {
      throw new ActionWorkspaceServiceError(
        routineError?.message ?? "Repeating Action not found.",
      );
    }

    const { error } = await supabase.rpc("update_routine", {
      p_routine_id: routine.id,
      p_title: routine.title,
      p_cadence: cadence,
      p_estimated_minutes: routine.estimated_minutes,
      p_goal_id: routine.goal_id ?? undefined,
      p_project_id: routine.project_id ?? undefined,
      p_cadence_count: routine.cadence_count ?? undefined,
      p_weekdays: cadence === "certain_days" ? weekdays : [],
      p_preferred_time: routine.preferred_time ?? undefined,
      p_skip_policy: routine.skip_policy,
    });

    ensureRpcSucceeded(error);
  }

  async stopRepeating(actionId: string) {
    const data = await this.getAction(actionId);
    if (!data.action.source_routine_id) {
      throw new ActionWorkspaceServiceError(
        "This Action does not have a repeating series.",
      );
    }

    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("transition_routine_status", {
      p_routine_id: data.action.source_routine_id,
      p_new_status: "ended",
    });

    ensureRpcSucceeded(error);
  }

  async restoreToToday(actionId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callPendingActionWorkspaceRpc(
      supabase,
      "restore_action_to_today",
      { p_daily_action_id: actionId },
    );

    ensureRpcSucceeded(error);
  }

  async askClarity(actionId: string, question: string) {
    const parsed = taskAssistantQuestionSchema.parse({ actionId, question });
    const data = await this.getAction(parsed.actionId);
    const plan = requireActionPlan(data.plan);
    const response = await this.taskAssistant.respond({
      action: data.action,
      plan,
      question: parsed.question,
      notes: data.notes.map((note) => note.note),
    });
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc(
      "save_action_assistant_exchange",
      {
        p_daily_action_id: data.action.id,
        p_question: parsed.question,
        p_response: encodeTaskAssistantResponse(response),
      },
    );

    ensureRpcSucceeded(error);
    return response;
  }

  async applyAssistantRevision(actionId: string, messageId: string) {
    const data = await this.getAction(actionId);
    const plan = requireActionPlan(data.plan);
    const message = data.messages.find(
      (candidate) =>
        candidate.id === messageId && candidate.role === "assistant",
    );
    const proposal = message
      ? parseTaskAssistantContent(message.content).proposal
      : null;

    if (!proposal) {
      throw new ActionWorkspaceServiceError(
        "This suggested change is no longer available.",
      );
    }

    const revisionInput = editActionSchema.parse({
      title: proposal.action.title,
      actionType: proposal.action.actionType,
      estimatedMinutes: proposal.action.estimatedMinutes,
      scheduledTime:
        proposal.action.actionType === "fixed" &&
        proposal.action.scheduledTime
          ? localTimeFor(
              proposal.action.scheduledTime,
              data.profile.timezone,
            )
          : "",
      whyItExists: proposal.action.whyItExists,
      definitionOfDone: proposal.action.definitionOfDone,
      suggestedMethod: proposal.action.suggestedMethod,
    });

    if (proposal.operation === "replace") {
      const { supabase } = await getAuthenticatedUserAndProfile();
      const { error } = await callPendingActionWorkspaceRpc(
        supabase,
        "replace_active_action",
        {
          p_daily_action_id: data.action.id,
          ...rpcActionFields(
            revisionInput,
            plan.local_date,
            data.profile.timezone,
          ),
        },
      );
      ensureRpcSucceeded(error);
      return { destination: "today" as const, notice: "action-replaced" };
    }

    await this.adaptAction(actionId, {
      ...revisionInput,
      outcome:
        proposal.operation === "drop"
          ? "drop"
          : proposal.operation === "move_tomorrow"
            ? "tomorrow"
            : "keep",
      targetDate: "",
    });

    if (proposal.operation === "drop") {
      return { destination: "today" as const, notice: "removed" };
    }

    if (proposal.operation === "move_tomorrow") {
      return { destination: "today" as const, notice: "changes-saved" };
    }

    return { destination: "detail" as const, notice: "changes-saved" };
  }

  isCurrentLocalPlan(localDate: string, timezone: string) {
    return localDate === getLocalDate(timezone);
  }
}

type NewActionTiming =
  | {
      outcome: "ready";
      estimatedMinutes: number;
      scheduledTime: string | null;
      startOn: string | null;
    }
  | {
      outcome: "validation_error";
      message: string;
    }
  | {
      outcome: "warning";
      shortenedMinutes: number;
    };

function resolveNewActionTiming(
  input: AddActionInput,
  plan: {
    local_date: string;
    aiming_to_sleep_at: string | null;
  },
  timezone: string,
  decision?: "shorten" | "move_tomorrow" | "add_anyway",
): NewActionTiming {
  if (input.actionType !== "fixed" || !input.scheduledTime) {
    return {
      outcome: "ready",
      estimatedMinutes: input.estimatedMinutes,
      scheduledTime: null,
      startOn: null,
    };
  }

  let targetDate = plan.local_date;
  let scheduledTime = localDateTimeToIso(
    targetDate,
    input.scheduledTime,
    timezone,
  );
  assertScheduledWallClock(
    scheduledTime,
    input.scheduledTime,
    timezone,
  );

  if (new Date(scheduledTime).getTime() <= Date.now()) {
    if (input.recurrencePattern === "none") {
      return {
        outcome: "validation_error",
        message:
          "That time has already passed. Choose a later time or remove the time.",
      };
    }

    targetDate = getNextRecurrenceDate(
      plan.local_date,
      input.recurrencePattern,
      input.recurrenceDays,
    );
    scheduledTime = localDateTimeToIso(
      targetDate,
      input.scheduledTime,
      timezone,
    );
    assertScheduledWallClock(
      scheduledTime,
      input.scheduledTime,
      timezone,
    );
  }

  const sleepTime = sleepTimeForTargetDate(plan, targetDate, timezone);
  const availableMinutes = sleepTime
    ? Math.floor(
        (new Date(sleepTime).getTime() -
          new Date(scheduledTime).getTime()) /
          60_000,
      )
    : null;
  const runsPastSleep =
    availableMinutes !== null &&
    input.estimatedMinutes > availableMinutes;

  if (runsPastSleep && !decision) {
    return {
      outcome: "warning",
      shortenedMinutes: Math.max(1, availableMinutes),
    };
  }

  let estimatedMinutes = input.estimatedMinutes;

  if (runsPastSleep && decision === "shorten") {
    estimatedMinutes = Math.max(1, availableMinutes);
  }

  if (runsPastSleep && decision === "move_tomorrow") {
    targetDate =
      input.recurrencePattern === "none"
        ? addLocalDays(plan.local_date, 1)
        : getNextRecurrenceDate(
            plan.local_date,
            input.recurrencePattern,
            input.recurrenceDays,
          );
    scheduledTime = localDateTimeToIso(
      targetDate,
      input.scheduledTime,
      timezone,
    );
    assertScheduledWallClock(
      scheduledTime,
      input.scheduledTime,
      timezone,
    );
  }

  return {
    outcome: "ready",
    estimatedMinutes,
    scheduledTime,
    startOn: targetDate === plan.local_date ? null : targetDate,
  };
}

function assertScheduledWallClock(
  scheduledTime: string,
  selectedLocalTime: string,
  timezone: string,
) {
  if (
    getLocalTime(timezone, new Date(scheduledTime)) !==
    selectedLocalTime
  ) {
    throw new ActionWorkspaceServiceError(
      "The selected time could not be preserved. Choose the time again.",
      "scheduledTime",
    );
  }
}

function sleepTimeForTargetDate(
  plan: {
    local_date: string;
    aiming_to_sleep_at: string | null;
  },
  targetDate: string,
  timezone: string,
) {
  if (!plan.aiming_to_sleep_at) {
    return null;
  }

  const sleepInstant = new Date(plan.aiming_to_sleep_at);
  const sleepLocalDate = getLocalDate(timezone, sleepInstant);
  const sleepDate =
    sleepLocalDate === plan.local_date
      ? targetDate
      : addLocalDays(targetDate, 1);

  return localDateTimeToIso(
    sleepDate,
    getLocalTime(timezone, sleepInstant),
    timezone,
  );
}

function requireActionPlan(plan: DailyPlan | null): DailyPlan {
  if (!plan) {
    throw new ActionWorkspaceServiceError(
      "This Action is not part of a Daily Plan.",
    );
  }
  return plan;
}

function recurrencePatternFor(
  routine: {
    cadence: "daily" | "weekly" | "times_per_week" | "certain_days";
  } | null,
) {
  if (!routine || routine.cadence === "times_per_week") return "none" as const;
  return routine.cadence;
}

function rpcActionFields(
  input: EditActionInput,
  localDate: string,
  timezone: string,
) {
  return {
    p_title: input.title,
    p_action_type: input.actionType,
    p_estimated_minutes: input.estimatedMinutes,
    p_scheduled_time:
      input.actionType === "fixed" && input.scheduledTime
        ? localDateTimeToIso(localDate, input.scheduledTime, timezone)
        : null,
    p_why_it_exists: input.whyItExists,
    p_definition_of_done: input.definitionOfDone,
    p_suggested_method: input.suggestedMethod,
  };
}

function easierTitle(title: string) {
  if (/\bcv\b/i.test(title)) {
    return "Improve one CV section";
  }

  const withoutCompound = title.split(/\s+(?:and|&)\s+/i)[0]?.trim();
  const base = withoutCompound || title;

  return base.length > 150 ? `${base.slice(0, 147).trim()}…` : base;
}

function localTimeFor(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function localDayDistance(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export const actionWorkspaceService = new ActionWorkspaceService();
