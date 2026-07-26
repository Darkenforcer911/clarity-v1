import "server-only";

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { addLocalDays, getLocalDate } from "./date-time";

export type DailyPlan = Tables<"daily_plans">;
export type DailyAction = Tables<"daily_actions">;
export type DayRecord = Tables<"day_records">;
export type Profile = Tables<"profiles">;

export type DailyLoopData = {
  user: User;
  profile: Profile;
  localDate: string;
  plan: DailyPlan | null;
  actions: DailyAction[];
  dayRecord: DayRecord | null;
  rescheduledContext: DailyAction[];
  yesterdayRecord: DayRecord | null;
};

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
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
  const [planResult, rescheduledResult, yesterdayPlanResult] =
    await Promise.all([
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
        .select("id")
        .eq("user_id", user.id)
        .eq("local_date", yesterdayDate)
        .eq("status", "closed")
        .maybeSingle(),
    ]);

  if (planResult.error) {
    throw new Error(planResult.error.message);
  }

  if (rescheduledResult.error) {
    throw new Error(rescheduledResult.error.message);
  }

  if (yesterdayPlanResult.error) {
    throw new Error(yesterdayPlanResult.error.message);
  }

  const plan = planResult.data;
  const [actionsResult, recordResult, yesterdayRecordResult] =
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
      yesterdayPlanResult.data
        ? supabase
            .from("day_records")
            .select("*")
            .eq("user_id", user.id)
            .eq("daily_plan_id", yesterdayPlanResult.data.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
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

  return {
    user,
    profile,
    localDate,
    plan,
    actions: actionsResult.data,
    dayRecord: recordResult.data,
    rescheduledContext: rescheduledResult.data,
    yesterdayRecord: yesterdayRecordResult.data,
  };
}
