import "server-only";

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import {
  CATCH_UP_ELIGIBLE_STATUSES,
  isCatchUpEligibleAction,
} from "./catch-up-eligibility";
import { addLocalDays, getLocalDate } from "./date-time";

export type DailyPlan = Tables<"daily_plans"> & {
  record_kind: "planned" | "recorded_without_plan" | "skipped";
};
export type DailyAction = Tables<"daily_actions"> & {
  completion_recorded_at: string | null;
  completion_time_unknown: boolean;
  reschedule_count: number;
};
export type DayRecord = Tables<"day_records">;
export type Profile = Tables<"profiles">;
export type ActionNote = Tables<"action_notes">;
export type ActionAssistantMessage = Tables<"action_assistant_messages">;
export type CarriedAction = DailyAction & {
  sourceLocalDate: string;
};
export type ReturnGapRecord = {
  id: string;
  gapStartDate: string;
  gapEndDate: string;
  contextSummary: string | null;
  nothingImportant: boolean;
  recordedAt: string;
};
export type PendingReturnGap = {
  gapStartDate: string;
  gapEndDate: string;
};

export type PreviousDayTransition =
  | {
      kind: "wrap_up";
      localDate: string;
      plan: DailyPlan;
      actions: DailyAction[];
    }
  | {
      kind: "unrecorded";
      localDate: string;
    };

export type DailyLoopData = {
  user: User;
  profile: Profile;
  localDate: string;
  plan: DailyPlan | null;
  actions: DailyAction[];
  dayRecord: DayRecord | null;
  rescheduledContext: DailyAction[];
  carriedActions: CarriedAction[];
  yesterdayRecord: DayRecord | null;
  previousDayTransition: PreviousDayTransition | null;
  pendingReturnGap: PendingReturnGap | null;
  latestReturnGapRecord: ReturnGapRecord | null;
};

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export class ActionNotFoundError extends Error {
  constructor() {
    super("Action not found");
    this.name = "ActionNotFoundError";
  }
}

export async function getAuthenticatedUserAndProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AuthenticationRequiredError();
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Profile not found.");
  }

  return { supabase, user, profile };
}

export async function getDailyLoopData(): Promise<DailyLoopData> {
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const localDate = getLocalDate(profile.timezone);
  const yesterdayDate = addLocalDays(localDate, -1);
  const [
    planResult,
    rescheduledResult,
    previousPlanResult,
    yesterdayPlanResult,
    latestReturnGapResult,
  ] = await Promise.all([
      supabase
        .from("daily_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("local_date", localDate)
        .maybeSingle(),
      supabase
        .from("daily_actions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "rescheduled")
        .eq("rescheduled_for", localDate)
        .order("sort_order"),
      supabase
        .from("daily_plans")
        .select("*")
        .eq("user_id", user.id)
        .lt("local_date", localDate)
        .order("local_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("daily_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("local_date", yesterdayDate)
        .maybeSingle(),
      callUntypedRpc(supabase, "get_latest_return_gap_record", {}),
    ]);

  if (planResult.error) {
    throw new Error(planResult.error.message);
  }

  if (rescheduledResult.error) {
    throw new Error(rescheduledResult.error.message);
  }

  const rescheduledActions = rescheduledResult.data as DailyAction[];
  const sourcePlanIds = [
    ...new Set(
      rescheduledActions.map((action) => action.daily_plan_id),
    ),
  ];
  const sourcePlansResult =
    sourcePlanIds.length > 0
      ? await supabase
          .from("daily_plans")
          .select("id, local_date")
          .eq("user_id", user.id)
          .in("id", sourcePlanIds)
      : { data: [], error: null };

  if (sourcePlansResult.error) {
    throw new Error(sourcePlansResult.error.message);
  }

  const sourceDates = new Map(
    sourcePlansResult.data.map((plan) => [plan.id, plan.local_date]),
  );
  const carriedActions = rescheduledActions.map((action) => {
    const sourceLocalDate = sourceDates.get(action.daily_plan_id);

    if (!sourceLocalDate) {
      throw new Error("Carried action source plan not found.");
    }

    return {
      ...action,
      sourceLocalDate,
    };
  });

  if (previousPlanResult.error) {
    throw new Error(previousPlanResult.error.message);
  }

  if (yesterdayPlanResult.error) {
    throw new Error(yesterdayPlanResult.error.message);
  }

  if (latestReturnGapResult.error) {
    throw new Error(latestReturnGapResult.error.message);
  }

  const plan = planResult.data as DailyPlan | null;
  const previousPlan = previousPlanResult.data as DailyPlan | null;
  const yesterdayPlan = yesterdayPlanResult.data as DailyPlan | null;
  const latestReturnGapRecord = parseReturnGapRecord(
    latestReturnGapResult.data,
  );
  const needsPreviousWrap =
    previousPlan !== null &&
    ["proposed", "active", "closing"].includes(previousPlan.status);
  const [actionsResult, recordResult, yesterdayRecordResult, previousActionsResult] =
    await Promise.all([
      plan
        ? supabase
            .from("daily_actions")
            .select("*")
            .eq("user_id", user.id)
            .eq("daily_plan_id", plan.id)
            .neq("status", "removed")
            .order("sort_order")
        : Promise.resolve({ data: [] as DailyAction[], error: null }),
      plan
        ? supabase
            .from("day_records")
            .select("*")
            .eq("user_id", user.id)
            .eq("daily_plan_id", plan.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      yesterdayPlan?.status === "closed"
        ? supabase
            .from("day_records")
            .select("*")
            .eq("user_id", user.id)
            .eq("daily_plan_id", yesterdayPlan.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      needsPreviousWrap && previousPlan
        ? supabase
            .from("daily_actions")
            .select("*")
            .eq("user_id", user.id)
            .eq("daily_plan_id", previousPlan.id)
            .in("status", [...CATCH_UP_ELIGIBLE_STATUSES])
            .not("approved_at", "is", null)
            .order("sort_order")
        : Promise.resolve({ data: [] as Tables<"daily_actions">[], error: null }),
    ]);

  if (actionsResult.error) {
    throw new Error(actionsResult.error.message);
  }

  if (recordResult.error) {
    throw new Error(recordResult.error.message);
  }

  if (yesterdayRecordResult.error) {
    throw new Error(yesterdayRecordResult.error.message);
  }

  if (previousActionsResult.error) {
    throw new Error(previousActionsResult.error.message);
  }

  const previousDayTransition: PreviousDayTransition | null =
    needsPreviousWrap && previousPlan
      ? {
          kind: "wrap_up",
          localDate: previousPlan.local_date,
          plan: previousPlan,
          actions: (
            previousActionsResult.data as DailyAction[]
          ).filter(isCatchUpEligibleAction),
        }
      : null;
  const gapAnchorDate = latestDate(
    previousPlan?.local_date ?? null,
    latestReturnGapRecord?.gapEndDate ?? null,
  );
  const gapStartDate = gapAnchorDate
    ? addLocalDays(gapAnchorDate, 1)
    : null;
  const pendingReturnGap =
    !needsPreviousWrap &&
    previousPlan?.status === "closed" &&
    gapStartDate &&
    gapStartDate <= yesterdayDate
      ? {
          gapStartDate,
          gapEndDate: yesterdayDate,
        }
      : null;
  const currentActions = actionsResult.data as DailyAction[];
  const adoptedTitles = new Set(
    currentActions
      .filter((action) =>
        ["proposed", "active", "completed"].includes(action.status),
      )
      .map((action) => action.title.trim().toLowerCase()),
  );
  const rescheduledContext = rescheduledActions.filter(
    (action) => !adoptedTitles.has(action.title.trim().toLowerCase()),
  );

  return {
    user,
    profile,
    localDate,
    plan,
    actions: currentActions,
    dayRecord: recordResult.data,
    rescheduledContext,
    carriedActions,
    yesterdayRecord: yesterdayRecordResult.data,
    previousDayTransition,
    pendingReturnGap,
    latestReturnGapRecord,
  };
}

function latestDate(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function parseReturnGapRecord(value: unknown): ReturnGapRecord | null {
  if (value === null) {
    return null;
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("Return gap record is invalid.");
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.gapStartDate !== "string" ||
    typeof record.gapEndDate !== "string" ||
    (record.contextSummary !== null &&
      typeof record.contextSummary !== "string") ||
    typeof record.nothingImportant !== "boolean" ||
    typeof record.recordedAt !== "string"
  ) {
    throw new Error("Return gap record is invalid.");
  }

  return {
    id: record.id,
    gapStartDate: record.gapStartDate,
    gapEndDate: record.gapEndDate,
    contextSummary: record.contextSummary,
    nothingImportant: record.nothingImportant,
    recordedAt: record.recordedAt,
  };
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

export async function getActionWorkspaceData(actionId: string) {
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const { data: action, error: actionError } = await supabase
    .from("daily_actions")
    .select("*")
    .eq("id", actionId)
    .eq("user_id", user.id)
    .neq("status", "removed")
    .maybeSingle();

  if (actionError) {
    throw new Error(actionError.message);
  }

  if (!action) {
    throw new ActionNotFoundError();
  }

  const [planResult, notesResult, messagesResult] = await Promise.all([
    supabase
      .from("daily_plans")
      .select("*")
      .eq("id", action.daily_plan_id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("action_notes")
      .select("*")
      .eq("daily_action_id", action.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("action_assistant_messages")
      .select("*")
      .eq("daily_action_id", action.id)
      .eq("user_id", user.id)
      .order("created_at"),
  ]);

  if (planResult.error) {
    throw new Error(planResult.error.message);
  }

  if (notesResult.error) {
    throw new Error(notesResult.error.message);
  }

  if (messagesResult.error) {
    throw new Error(messagesResult.error.message);
  }

  return {
    user,
    profile,
    action: action as DailyAction,
    plan: planResult.data as DailyPlan,
    notes: notesResult.data,
    messages: messagesResult.data,
  };
}
