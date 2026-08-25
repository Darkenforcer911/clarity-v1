import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { z } from "zod";
import {
  addLocalDays,
  getLocalDate,
  getLocalTime,
  hasScheduledMinutePassed,
  localDateTimeToIso,
} from "./date-time";
import {
  closeDayResolutionSchema,
  daySummarySchema,
  generatedPlanSchema,
  previousDayExplanationSchema,
  previousDayResolutionSchema,
  previousDayUnplannedWorkSchema,
  shapeTodaySchema,
  type CloseDayResolution,
  type DaySummary,
  type PreviousDayResolution,
  type PreviousDayUnplannedWork,
  type ShapeTodayInput,
} from "./schemas";
import {
  getAuthenticatedUserAndProfile,
  getDailyLoopData,
  type DailyLoopData,
} from "./daily-loop-queries";
import { isCatchUpEligibleAction } from "./catch-up-eligibility";
import type { ClarityAI } from "./ai/clarity-ai";
import { MockClarityAI } from "./ai/mock-clarity-ai";
import type { PreviousDayInterpreter } from "./ai/previous-day-interpreter";
import { MockPreviousDayInterpreter } from "./ai/mock-previous-day-interpreter";

export class DailyLoopServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyLoopServiceError";
  }
}

const startCurrentDayResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("started"),
    planId: z.string().uuid(),
    localDate: z.string(),
  }),
  z.object({
    outcome: z.literal("quick_recap_required"),
    previousLocalDate: z.string(),
    previousPlanStatus: z.enum(["proposed", "active", "closing"]),
  }),
  z.object({
    outcome: z.literal("catch_up_required"),
    rangeStartDate: z.string(),
    rangeEndDate: z.string(),
    dayCount: z.number().int().min(1).max(7),
  }),
  z.object({
    outcome: z.literal("get_current_required"),
    rangeStartDate: z.string(),
    rangeEndDate: z.string(),
    dayCount: z.number().int().min(8),
  }),
  z.object({
    outcome: z.literal("current_day_already_started"),
    planId: z.string().uuid(),
    localDate: z.string(),
    planStatus: z.string(),
  }),
]);

type BeginDayShapingResult = z.infer<
  typeof startCurrentDayResultSchema
>;

function ensureRpcSucceeded(error: { message: string } | null) {
  if (error) {
    throw new DailyLoopServiceError(error.message);
  }
}

export class DailyLoopService {
  constructor(
    private readonly clarityAI: ClarityAI = new MockClarityAI(),
    private readonly previousDayInterpreter: PreviousDayInterpreter =
      new MockPreviousDayInterpreter(),
  ) {}

  getToday() {
    return getDailyLoopData();
  }

  async recordAppOpened(timezone: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("record_app_opened", {
      p_timezone: timezone,
    });

    ensureRpcSucceeded(error);
  }

  async beginDayShaping(): Promise<BeginDayShapingResult> {
    const currentData = await getDailyLoopData();

    if (currentData.previousDayTransition?.kind === "wrap_up") {
      return {
        outcome: "quick_recap_required",
        previousLocalDate: currentData.previousDayTransition.localDate,
        previousPlanStatus: currentData.previousDayTransition.plan.status as
          | "proposed"
          | "active"
          | "closing",
      };
    }

    if (currentData.pendingReturnGap) {
      return {
        outcome:
          currentData.pendingReturnGap.kind === "catch_up"
            ? "catch_up_required"
            : "get_current_required",
        rangeStartDate: currentData.pendingReturnGap.gapStartDate,
        rangeEndDate: currentData.pendingReturnGap.gapEndDate,
        dayCount: currentData.pendingReturnGap.dayCount,
      };
    }

    const { supabase } = await getAuthenticatedUserAndProfile();
    const { data, error } = await callUntypedRpc(
      supabase,
      "start_current_day_v2",
      {},
    );

    ensureRpcSucceeded(error);
    const parsed = startCurrentDayResultSchema.safeParse(data);

    if (!parsed.success) {
      throw new DailyLoopServiceError(
        "Clarity couldn't verify the day-start result.",
      );
    }

    return parsed.data;
  }

  async interpretPreviousDay(
    data: DailyLoopData,
    rawExplanation: string,
  ) {
    const explanation = previousDayExplanationSchema.parse(rawExplanation);
    const transition = data.previousDayTransition;

    if (!transition || transition.kind !== "wrap_up") {
      throw new DailyLoopServiceError(
        "There is no previous plan waiting for wrap-up.",
      );
    }

    const unfinishedActions = transition.actions.filter(
      (action) =>
        action.approved_at &&
        ["active", "rescheduled"].includes(action.status),
    );
    const interpretation = await this.previousDayInterpreter.interpret({
      explanation,
      actions: unfinishedActions,
    });

    if (interpretation.outcome === "needs_input") {
      return interpretation;
    }

    return {
      outcome: "suggestions" as const,
      suggestions: interpretation.suggestions.map((suggestion) => ({
        ...suggestion,
        completedAt: suggestion.completedLocalTime
          ? localDateTimeToIso(
              transition.localDate,
              suggestion.completedLocalTime,
              data.profile.timezone,
            )
          : undefined,
      })),
      unplannedProgress: interpretation.unplannedProgress,
      contextSummary: interpretation.contextSummary,
      ongoingContextCandidate:
        interpretation.ongoingContextCandidate,
    };
  }

  async reconcilePreviousDay(
    data: DailyLoopData,
    rawResolutions: PreviousDayResolution[],
    rawUnplannedWork: PreviousDayUnplannedWork[],
    contextSummary: string | null = null,
  ) {
    const transition = data.previousDayTransition;

    if (!transition || transition.kind !== "wrap_up") {
      throw new DailyLoopServiceError(
        "There is no previous plan waiting for wrap-up.",
      );
    }

    const resolutions = rawResolutions.map((resolution) =>
      previousDayResolutionSchema.parse(resolution),
    );
    const eligibleActionIds = new Set(
      transition.actions
        .filter(isCatchUpEligibleAction)
        .map((action) => action.id),
    );
    const submittedActionIds = new Set(
      resolutions.map((resolution) => resolution.actionId),
    );

    if (
      resolutions.length !== eligibleActionIds.size ||
      submittedActionIds.size !== eligibleActionIds.size ||
      resolutions.some(
        (resolution) => !eligibleActionIds.has(resolution.actionId),
      )
    ) {
      throw new DailyLoopServiceError(
        "Recap contains an action that was not part of the plan at rollover.",
      );
    }

    const unplannedWork = rawUnplannedWork.map((item) =>
      previousDayUnplannedWorkSchema.parse(item),
    );

    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callUntypedRpc(
      supabase,
      "reconcile_previous_day_direct_v3",
      {
        p_daily_plan_id: transition.plan.id,
        p_extra_context: null,
        p_resolutions: resolutions,
        p_unplanned_progress: unplannedWork,
        p_context_summary: contextSummary,
        p_ongoing_context_candidate: null,
      },
    );

    ensureRpcSucceeded(error);
  }

  async recordReturnBoundary(data: DailyLoopData) {
    const gap = data.pendingReturnGap;

    if (!gap || data.previousDayTransition) {
      throw new DailyLoopServiceError(
        "There is no return boundary waiting to be recorded.",
      );
    }

    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callUntypedRpc(
      supabase,
      "record_return_boundary_v1",
      {
        p_boundary_kind: gap.kind,
        p_range_start_date: gap.gapStartDate,
        p_range_end_date: gap.gapEndDate,
      },
    );

    ensureRpcSucceeded(error);
  }

  async recordHistoricalDay(
    data: DailyLoopData,
    explanation: string,
    skipped: boolean,
  ) {
    const transition = data.previousDayTransition;

    if (!transition || transition.kind !== "unrecorded") {
      throw new DailyLoopServiceError(
        "There is no unrecorded previous day to resolve.",
      );
    }

    const parsedExplanation = skipped
      ? ""
      : previousDayExplanationSchema.parse(explanation);
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callUntypedRpc(
      supabase,
      "record_historical_day",
      {
        p_local_date: transition.localDate,
        p_explanation: parsedExplanation || null,
        p_skipped: skipped,
      },
    );

    ensureRpcSucceeded(error);
  }

  async setBriefingContextDecision(
    data: DailyLoopData,
    dayRecordId: string,
    decision: "remembered" | "once" | "dismissed",
  ) {
    if (
      !data.yesterdayRecord ||
      data.yesterdayRecord.id !== dayRecordId
    ) {
      throw new DailyLoopServiceError(
        "This context prompt is no longer available.",
      );
    }

    const progress = data.yesterdayRecord.progress_recorded;

    if (
      !progress ||
      typeof progress !== "object" ||
      Array.isArray(progress)
    ) {
      throw new DailyLoopServiceError("Day Record is invalid.");
    }

    const candidate = progress.ongoingContextCandidate;

    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate) ||
      typeof candidate.label !== "string" ||
      typeof candidate.sourceText !== "string" ||
      candidate.decision
    ) {
      throw new DailyLoopServiceError(
        "This context prompt has already been resolved.",
      );
    }

    const { supabase, user } = await getAuthenticatedUserAndProfile();
    const updatedProgress: Json = {
      ...progress,
      ongoingContextCandidate: {
        ...candidate,
        decision,
        decidedAt: new Date().toISOString(),
      },
    };
    const { error } = await supabase
      .from("day_records")
      .update({ progress_recorded: updatedProgress })
      .eq("id", dayRecordId)
      .eq("user_id", user.id);

    ensureRpcSucceeded(error);
  }

  async buildPlan(rawInput: ShapeTodayInput) {
    const input = shapeTodaySchema.parse(rawInput);
    const currentData = await getDailyLoopData();

    if (
      currentData.previousDayTransition ||
      currentData.pendingReturnGap ||
      !currentData.plan ||
      currentData.plan.status !== "unshaped"
    ) {
      throw new DailyLoopServiceError(
        "Start today before building its plan.",
      );
    }

    const { supabase, user, profile } =
      await getAuthenticatedUserAndProfile();
    const localDate = getLocalDate(profile.timezone);
    const currentLocalTime = getLocalTime(profile.timezone);
    const statedContextForToday = input.contextForToday;
    const generatedPlan = generatedPlanSchema.parse(
      await this.clarityAI.buildPlan({
        userId: user.id,
        localDate,
        timezone: profile.timezone,
        contextForToday: statedContextForToday || null,
        currentLocalTime,
        carriedActions: currentData.rescheduledContext.map((action) => ({
          sourceActionId: action.id,
          title: action.title,
          estimatedMinutes: action.estimated_minutes,
          whyItExists: action.why_it_exists,
          definitionOfDone: action.definition_of_done,
          suggestedMethod: action.suggested_method,
          rescheduleCount: action.reschedule_count,
        })),
        previousDay: previousDayForPlanGeneration(currentData),
        returnGap: currentData.latestReturnGapRecord
          ? {
              gapStartDate:
                currentData.latestReturnGapRecord.gapStartDate,
              gapEndDate:
                currentData.latestReturnGapRecord.gapEndDate,
              contextSummary:
                currentData.latestReturnGapRecord.contextSummary,
              nothingImportant:
                currentData.latestReturnGapRecord.nothingImportant,
              recordedAt:
                currentData.latestReturnGapRecord.recordedAt,
            }
          : null,
      }),
    );
    const actions: Json = generatedPlan.actions.map((action) => {
      const scheduledTime = action.scheduledTime
        ? localDateTimeToIso(
            localDate,
            action.scheduledTime,
            profile.timezone,
          )
        : null;

      if (
        action.actionType === "fixed" &&
        scheduledTime &&
        new Date(scheduledTime).getTime() <= Date.now()
      ) {
        throw new DailyLoopServiceError(
          "That time has already passed. Choose a later time or remove the time.",
        );
      }

      return {
        ...action,
        scheduledTime,
      };
    });
    const { error } = await callUntypedRpc(
      supabase,
      "save_context_only_proposed_plan",
      {
        p_local_date: localDate,
        p_context_for_today: statedContextForToday,
        p_focus: generatedPlan.focus,
        p_actions: actions,
      },
    );

    ensureRpcSucceeded(error);
  }

  async ensureInitialPlanProposal() {
    const data = await getDailyLoopData();

    if (
      data.previousDayTransition ||
      data.pendingReturnGap ||
      !data.plan
    ) {
      throw new DailyLoopServiceError(
        "Finish the previous-day transition before starting today.",
      );
    }

    if (data.plan.status === "proposed") {
      return data.plan.id;
    }

    if (data.plan.status !== "unshaped") {
      throw new DailyLoopServiceError(
        "Today can no longer create an initial proposal.",
      );
    }

    await this.buildPlan({});

    const proposedData = await getDailyLoopData();
    if (proposedData.plan?.status !== "proposed") {
      throw new DailyLoopServiceError(
        "Clarity couldn't create today's proposal.",
      );
    }

    return proposedData.plan.id;
  }

  async approvePlan(planId: string, allowEmptyPlan = false) {
    const currentData = await getDailyLoopData();

    if (
      currentData.previousDayTransition ||
      currentData.pendingReturnGap ||
      currentData.plan?.id !== planId ||
      currentData.plan.local_date !== currentData.localDate
    ) {
      throw new DailyLoopServiceError(
        "Today has changed. Return to Today before approving this plan.",
      );
    }

    const hasUnresolvedPassedTime = currentData.actions.some(
      (action) =>
        action.status === "proposed" &&
        action.action_type === "fixed" &&
        hasScheduledMinutePassed(
          action.scheduled_time,
          currentData.plan!.local_date,
          currentData.profile.timezone,
        ),
    );

    if (hasUnresolvedPassedTime) {
      throw new DailyLoopServiceError(
        "Resolve passed action times before beginning.",
      );
    }

    const { supabase } = await getAuthenticatedUserAndProfile();
    const hasCompletedEvidence = currentData.actions.some(
      (action) => action.status === "completed",
    );
    const { error } = allowEmptyPlan || hasCompletedEvidence
      ? await callUntypedRpc(supabase, "approve_daily_plan_v2", {
          p_daily_plan_id: planId,
          p_allow_empty: allowEmptyPlan,
        })
      : await supabase.rpc("approve_daily_plan", {
          p_daily_plan_id: planId,
        });

    ensureRpcSucceeded(error);
  }

  async setActionCompletion(actionId: string, completed: boolean) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("set_action_completion", {
      p_daily_action_id: actionId,
      p_completed: completed,
    });

    ensureRpcSucceeded(error);
  }

  async beginDayClosing(planId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("begin_day_closing", {
      p_daily_plan_id: planId,
    });

    ensureRpcSucceeded(error);
  }

  async cancelDayClosing(planId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await callUntypedRpc(
      supabase,
      "cancel_day_closing",
      {
        p_daily_plan_id: planId,
      },
    );

    ensureRpcSucceeded(error);
  }

  async undoDayClose(planId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("undo_day_close", {
      p_daily_plan_id: planId,
    });

    ensureRpcSucceeded(error);
  }

  async finishDay(
    data: DailyLoopData,
    resolutions: CloseDayResolution[],
    notes: string,
  ) {
    if (!data.plan || data.plan.status !== "closing") {
      throw new DailyLoopServiceError("This plan is not ready for Close Day.");
    }

    const unfinishedActions = data.actions.filter(
      (action) => action.approved_at && action.status === "active",
    );

    if (resolutions.length !== unfinishedActions.length) {
      throw new DailyLoopServiceError(
        "Choose an outcome for every unfinished action.",
      );
    }

    const resolutionByAction = new Map(
      resolutions.map((resolution) => [
        resolution.actionId,
        closeDayResolutionSchema.parse(resolution),
      ]),
    );
    const { supabase } = await getAuthenticatedUserAndProfile();

    for (const action of unfinishedActions) {
      const resolution = resolutionByAction.get(action.id);

      if (!resolution) {
        throw new DailyLoopServiceError(
          `Choose an outcome for ${action.title}.`,
        );
      }

      if (
        resolution.outcome === "choose_date" &&
        resolution.selectedDate &&
        resolution.selectedDate <= data.localDate
      ) {
        throw new DailyLoopServiceError(
          `Choose a future date for ${action.title}.`,
        );
      }

      const { error } = await supabase.rpc("resolve_daily_action", {
        p_daily_action_id: action.id,
        p_outcome: resolution.outcome,
        ...(resolution.selectedDate
          ? { p_selected_date: resolution.selectedDate }
          : {}),
        ...(resolution.resolutionNote
          ? { p_resolution_note: resolution.resolutionNote }
          : {}),
      });

      ensureRpcSucceeded(error);
    }

    const { error } = await supabase.rpc("finish_day", {
      p_daily_plan_id: data.plan.id,
      ...(notes.trim() ? { p_notes: notes.trim() } : {}),
    });

    ensureRpcSucceeded(error);
  }

  parseDaySummary(data: DailyLoopData): DaySummary {
    if (!data.dayRecord) {
      throw new DailyLoopServiceError("Day Summary not found.");
    }

    return daySummarySchema.parse(data.dayRecord.progress_recorded);
  }

  tomorrowFor(data: DailyLoopData) {
    return addLocalDays(data.localDate, 1);
  }
}

async function callUntypedRpc(
  supabase: { rpc: unknown },
  functionName: string,
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

function previousDayForPlanGeneration(data: DailyLoopData) {
  if (!data.yesterdayRecord) {
    return null;
  }

  const summary = daySummarySchema.safeParse(
    data.yesterdayRecord.progress_recorded,
  );

  if (!summary.success) {
    return null;
  }

  return {
    explanation:
      summary.data.contextSummary ??
      data.yesterdayRecord.notes?.trim() ??
      null,
    completedCount: summary.data.completedCount,
    movedCount: summary.data.unfinishedActions.filter(
      (action) => action.outcome === "rescheduled",
    ).length,
    droppedCount: summary.data.unfinishedActions.filter(
      (action) => action.outcome === "dropped",
    ).length,
    historicalOutcomes: summary.data.unfinishedActions.flatMap(
      (action) =>
        action.outcome === "made_progress" ||
        action.outcome === "not_done"
          ? [
              {
                actionId: action.id,
                title: action.title,
                outcome: action.outcome,
                notDoneContext:
                  action.outcome === "not_done"
                    ? (action.notDoneNote ?? null)
                    : null,
                progressDescription: action.progressNote ?? null,
                remainingWork: action.remainingWork ?? null,
                blockerNote: action.blockerNote ?? null,
                approximateMinutes:
                  action.approximateMinutes ?? null,
                approximateWorkTime:
                  action.approximateWorkTime ?? null,
                linkedContextLabel:
                  action.linkedContextLabel ?? null,
                linkedContextKind:
                  action.linkedContextKind ?? null,
              },
            ]
          : [],
    ),
    unplannedCarryoverCandidates:
      summary.data.unplannedProgress
        ?.filter(
          (
            item,
          ): item is Exclude<typeof item, string> =>
            typeof item !== "string" &&
            item.outcome === "made_progress" &&
            item.carryoverCandidate === true,
        )
        .map((item) => ({
          title: item.title,
          estimatedMinutes: item.estimatedMinutes,
          progressLevel: item.progressLevel ?? null,
          progressNote: item.progressNote ?? null,
        })) ?? [],
  };
}

export const dailyLoopService = new DailyLoopService();
