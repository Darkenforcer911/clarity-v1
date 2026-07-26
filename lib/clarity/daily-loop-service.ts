import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import {
  addLocalDays,
  getLocalDate,
  localDateTimeToIso,
  resolveShapeTimes,
} from "./date-time";
import {
  closeDayResolutionSchema,
  daySummarySchema,
  generatedPlanSchema,
  shapeTodaySchema,
  type CloseDayResolution,
  type DaySummary,
  type ShapeTodayInput,
} from "./schemas";
import {
  getAuthenticatedUserAndProfile,
  getDailyLoopData,
  type DailyLoopData,
} from "./daily-loop-queries";
import type { ClarityAI } from "./ai/clarity-ai";
import { MockClarityAI } from "./ai/mock-clarity-ai";

export class DailyLoopServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyLoopServiceError";
  }
}

function ensureRpcSucceeded(error: { message: string } | null) {
  if (error) {
    throw new DailyLoopServiceError(error.message);
  }
}

export class DailyLoopService {
  constructor(private readonly clarityAI: ClarityAI = new MockClarityAI()) {}

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

  async beginDayShaping() {
    const { supabase, profile } = await getAuthenticatedUserAndProfile();
    const localDate = getLocalDate(profile.timezone);
    const { error } = await supabase.rpc("begin_day_shaping", {
      p_local_date: localDate,
    });

    ensureRpcSucceeded(error);
  }

  async buildPlan(rawInput: ShapeTodayInput) {
    const input = shapeTodaySchema.parse(rawInput);
    const { supabase, user, profile } =
      await getAuthenticatedUserAndProfile();
    const localDate = getLocalDate(profile.timezone);
    const times = resolveShapeTimes(
      localDate,
      input.wokeAt,
      input.aimingToSleepAt,
      profile.timezone,
    );
    const generatedPlan = generatedPlanSchema.parse(
      await this.clarityAI.buildPlan({
        userId: user.id,
        localDate,
        timezone: profile.timezone,
        wokeAt: times.wokeAt,
        aimingToSleepAt: times.aimingToSleepAt,
        contextForToday: input.nothingElseToday
          ? null
          : input.contextForToday,
      }),
    );
    const actions: Json = generatedPlan.actions.map((action) => ({
      ...action,
      scheduledTime: action.scheduledTime
        ? localDateTimeToIso(
            localDate,
            action.scheduledTime,
            profile.timezone,
          )
        : null,
    }));
    const { error } = await supabase.rpc("save_proposed_plan", {
      p_local_date: localDate,
      p_woke_at: times.wokeAt,
      p_aiming_to_sleep_at: times.aimingToSleepAt,
      p_context_for_today: input.nothingElseToday
        ? ""
        : input.contextForToday,
      p_focus: generatedPlan.focus,
      p_actions: actions,
    });

    ensureRpcSucceeded(error);
  }

  async approvePlan(planId: string) {
    const { supabase } = await getAuthenticatedUserAndProfile();
    const { error } = await supabase.rpc("approve_daily_plan", {
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

    const unfinishedActions = data.actions.filter((action) =>
      ["active", "rescheduled", "dropped"].includes(action.status),
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

export const dailyLoopService = new DailyLoopService();
