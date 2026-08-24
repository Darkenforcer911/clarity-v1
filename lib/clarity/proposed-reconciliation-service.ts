import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import type { CalendarEventOutcome } from "./calendar-commitments";
import { getLocalDate } from "./date-time";

export class ProposedPlanDateBoundaryError extends Error {
  constructor(
    readonly endedLocalDate: string,
    readonly currentLocalDate: string,
  ) {
    super("The proposed plan date has ended.");
    this.name = "ProposedPlanDateBoundaryError";
  }
}

type PendingRpcClient = SupabaseClient<Database>;

export async function createCompletedPlanEvidence(input: {
  planId: string;
  title: string;
  completedTime: string | null;
}) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  await callPendingRpc(supabase, "create_completed_plan_evidence", {
    p_daily_plan_id: input.planId,
    p_title: input.title,
    p_completed_time: input.completedTime,
  });
}

export async function updateCompletedPlanEvidence(input: {
  actionId: string;
  title: string;
  completedTime: string | null;
}) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  await callPendingRpc(supabase, "update_completed_plan_evidence", {
    p_daily_action_id: input.actionId,
    p_title: input.title,
    p_completed_time: input.completedTime,
  });
}

export async function deleteCompletedPlanEvidence(actionId: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  await callPendingRpc(supabase, "delete_completed_plan_evidence", {
    p_daily_action_id: actionId,
  });
}

export async function completeProposedAction(input: {
  actionId: string;
  completedTime: string | null;
}) {
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const { data: action, error: actionError } = await supabase
    .from("daily_actions")
    .select("daily_plan_id")
    .eq("id", input.actionId)
    .eq("user_id", user.id)
    .single();

  if (actionError || !action) {
    throw new Error(actionError?.message ?? "Daily action not found.");
  }

  const { data: plan, error: planError } = await supabase
    .from("daily_plans")
    .select("local_date")
    .eq("id", action.daily_plan_id)
    .eq("user_id", user.id)
    .single();

  if (planError || !plan) {
    throw new Error(planError?.message ?? "Daily plan not found.");
  }

  const currentLocalDate = getLocalDate(profile.timezone);
  if (plan.local_date !== currentLocalDate) {
    throw new ProposedPlanDateBoundaryError(
      plan.local_date,
      currentLocalDate,
    );
  }

  const { error } = await supabase.rpc(
    "complete_proposed_action_v2" as never,
    {
      p_daily_action_id: input.actionId,
      p_completed_time: input.completedTime,
    } as never,
  );

  if (error) {
    if (error.message.includes("Today has changed")) {
      throw new ProposedPlanDateBoundaryError(
        plan.local_date,
        getLocalDate(profile.timezone),
      );
    }
    throw new Error(error.message);
  }
}

export async function recordCalendarEventOutcome(input: {
  commitmentId: string;
  occurrenceDate: string;
  outcome: CalendarEventOutcome;
  note: string | null;
  newDate: string | null;
  newTime: string | null;
}) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  await callPendingRpc(supabase, "record_calendar_event_outcome", {
    p_calendar_commitment_id: input.commitmentId,
    p_occurrence_date: input.occurrenceDate,
    p_outcome: input.outcome,
    p_outcome_note: input.note,
    p_new_date: input.newDate,
    p_new_time: input.newTime,
  });
}

async function callPendingRpc(
  supabase: PendingRpcClient,
  functionName: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(
    functionName as never,
    args as never,
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
