import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import {
  CATCH_UP_ELIGIBLE_STATUSES,
  isCatchUpEligibleAction,
} from "./catch-up-eligibility";
import { addLocalDays, getLocalDate } from "./date-time";
import { startServerTimer } from "./server-performance";
import { resolvePreviousDayRouting } from "./previous-day-routing";

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
  removedProposedActions: DailyAction[];
  dayRecord: DayRecord | null;
  rescheduledContext: DailyAction[];
  carriedActions: CarriedAction[];
  yesterdayRecord: DayRecord | null;
  previousPlan: DailyPlan | null;
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

const getAuthenticatedUser = cache(async () => {
  const timer = startServerTimer("authentication");
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await timer.measure("session_verification", () =>
    supabase.auth.getUser(),
  );

  if (userError || !user) {
    throw new AuthenticationRequiredError();
  }

  timer.finish();
  return { supabase, user };
});

export const getAuthenticatedUserAndProfile = cache(async () => {
  const timer = startServerTimer("authentication_and_profile");
  const { supabase, user } = await getAuthenticatedUser();
  const { data: profile, error: profileError } = await timer.measure(
    "profile_loading",
    () =>
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single(),
  );

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Profile not found.");
  }

  timer.finish();
  return { supabase, user, profile };
});

export async function getDailyLoopData(): Promise<DailyLoopData> {
  const timer = startServerTimer("today_daily_loop");
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const localDate = getLocalDate(profile.timezone);
  const yesterdayDate = addLocalDays(localDate, -1);
  const [
    planResult,
    rescheduledResult,
    previousPlanResult,
    latestClosedPlanResult,
    latestReturnGapResult,
  ] = await timer.measure("primary_parallel_queries", () =>
    Promise.all([
      supabase
        .from("daily_plans")
        .select("*, daily_actions(*), day_records(*)")
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
        .select("*, daily_actions(*), day_records(*)")
        .eq("user_id", user.id)
        .lt("local_date", localDate)
        .order("local_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("daily_plans")
        .select("local_date")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .lt("local_date", localDate)
        .order("local_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      callUntypedRpc(supabase, "get_latest_return_gap_record", {}),
    ]),
  );

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
      ? await timer.measure("carried_action_sources", () =>
          supabase
            .from("daily_plans")
            .select("id, local_date")
            .eq("user_id", user.id)
            .in("id", sourcePlanIds),
        )
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

  if (latestClosedPlanResult.error) {
    throw new Error(latestClosedPlanResult.error.message);
  }

  if (latestReturnGapResult.error) {
    throw new Error(latestReturnGapResult.error.message);
  }

  const planRow = planResult.data as PlanWithDailyData | null;
  const previousPlanRow =
    previousPlanResult.data as PlanWithDailyData | null;
  const plan = stripPlanRelations(planRow);
  const previousPlan = stripPlanRelations(previousPlanRow);
  const latestReturnGapRecord = parseReturnGapRecord(
    latestReturnGapResult.data,
  );
  const previousDayRouting = resolvePreviousDayRouting({
    currentLocalDate: localDate,
    previousPlan: previousPlan
      ? {
          localDate: previousPlan.local_date,
          status: previousPlan.status,
          approvedAt: previousPlan.approved_at,
          hasApprovedActions: (
            previousPlanRow?.daily_actions ?? []
          ).some((action) => action.approved_at !== null),
        }
      : null,
    latestClosedPlanDate:
      latestClosedPlanResult.data?.local_date ?? null,
    latestGapEndDate:
      latestReturnGapRecord?.gapEndDate ?? null,
  });

  if (previousDayRouting.kind === "inconsistent_unapproved_plan") {
    throw new Error(
      "A previous daily plan has an invalid approval state.",
    );
  }
  const currentActions = (planRow?.daily_actions ?? [])
    .filter((action) => action.status !== "removed")
    .sort((left, right) => left.sort_order - right.sort_order);
  const removedProposedActions = (planRow?.daily_actions ?? [])
    .filter(
      (action) =>
        action.status === "removed" && action.approved_at === null,
    )
    .sort((left, right) => left.sort_order - right.sort_order);
  const dayRecord = firstRecord(planRow?.day_records);
  const yesterdayRecord =
    previousPlan?.local_date === yesterdayDate &&
    previousPlan.status === "closed"
      ? firstRecord(previousPlanRow?.day_records)
      : null;
  const previousActions = (previousPlanRow?.daily_actions ?? [])
    .filter(
      (action) =>
        CATCH_UP_ELIGIBLE_STATUSES.some(
          (status) => status === action.status,
        ) &&
        action.approved_at !== null,
    )
    .sort((left, right) => left.sort_order - right.sort_order);

  const previousDayTransition: PreviousDayTransition | null =
    previousDayRouting.kind === "quick_recap" && previousPlan
      ? {
          kind: "wrap_up",
          localDate: previousPlan.local_date,
          plan: previousPlan,
          actions: previousActions.filter(isCatchUpEligibleAction),
        }
      : null;
  const pendingReturnGap =
    previousDayRouting.kind === "gap"
      ? {
          gapStartDate: previousDayRouting.gapStartDate,
          gapEndDate: previousDayRouting.gapEndDate,
        }
      : null;
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

  const result = {
    user,
    profile,
    localDate,
    plan,
    actions: currentActions,
    removedProposedActions,
    dayRecord,
    rescheduledContext,
    carriedActions,
    yesterdayRecord,
    previousPlan,
    previousDayTransition,
    pendingReturnGap,
    latestReturnGapRecord,
  };

  timer.finish();
  return result;
}

type PlanWithDailyData = DailyPlan & {
  daily_actions: DailyAction[];
  day_records: DayRecord[];
};

function stripPlanRelations(
  plan: PlanWithDailyData | null,
): DailyPlan | null {
  if (!plan) {
    return null;
  }

  const row = { ...plan };
  delete (row as Partial<PlanWithDailyData>).daily_actions;
  delete (row as Partial<PlanWithDailyData>).day_records;
  return row as DailyPlan;
}

function firstRecord(records: DayRecord[] | undefined) {
  return records?.[0] ?? null;
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
  const timer = startServerTimer("action_workspace");
  const { supabase, user } = await getAuthenticatedUser();
  const [profileResult, actionResult, notesResult, messagesResult] =
    await timer.measure("parallel_workspace_queries", () =>
      Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single(),
        supabase
          .from("daily_actions")
          .select(
            "*, daily_plans!daily_actions_plan_owner_fkey(*)",
          )
          .eq("id", actionId)
          .eq("user_id", user.id)
          .neq("status", "removed")
          .maybeSingle(),
        supabase
          .from("action_notes")
          .select("*")
          .eq("daily_action_id", actionId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("action_assistant_messages")
          .select("*")
          .eq("daily_action_id", actionId)
          .eq("user_id", user.id)
          .order("created_at"),
      ]),
    );

  if (profileResult.error || !profileResult.data) {
    throw new Error(profileResult.error?.message ?? "Profile not found.");
  }

  if (actionResult.error) {
    throw new Error(actionResult.error.message);
  }

  const actionWithPlan = actionResult.data;

  if (!actionWithPlan) {
    throw new ActionNotFoundError();
  }

  if (notesResult.error) {
    throw new Error(notesResult.error.message);
  }

  if (messagesResult.error) {
    throw new Error(messagesResult.error.message);
  }

  const {
    daily_plans: plan,
    ...action
  } = actionWithPlan;

  if (!plan) {
    throw new Error("Daily plan not found.");
  }

  const result = {
    user,
    profile: profileResult.data,
    action: action as DailyAction,
    plan: plan as DailyPlan,
    notes: notesResult.data,
    messages: messagesResult.data,
  };

  timer.finish();
  return result;
}
