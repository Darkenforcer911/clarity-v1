import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import type { CalendarEventOutcome } from "./calendar-commitments";
import { getLocalDate } from "./date-time";
import type { CompletedPlanEvidenceInput } from "./completed-plan-evidence";

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
} & CompletedPlanEvidenceInput) {
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  const { data: plan, error: planError } = await supabase
    .from("daily_plans")
    .select("local_date")
    .eq("id", input.planId)
    .eq("user_id", user.id)
    .single();
  if (planError || !plan) {
    throw new Error(planError?.message ?? "Daily plan not found.");
  }
  await callPendingRpc(supabase, "create_action_occurrence_v1", {
    p_daily_plan_id: input.planId,
    p_local_date: plan.local_date,
    p_title: input.title,
    p_when_time: input.completedTime,
    p_duration_minutes: input.actualMinutes ?? 0,
    p_due_local_date: input.dueLocalDate,
    p_due_local_time: input.dueLocalTime,
    p_recurrence_pattern: input.recurrencePattern,
    p_recurrence_days: input.recurrenceDays,
    p_reminder_offsets_minutes: input.reminderOffsets,
    p_details: input.details,
    p_completed: true,
    p_completion_evidence_only: true,
  });
}

export async function updateCompletedPlanEvidence(input: {
  actionId: string;
} & CompletedPlanEvidenceInput) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  await callPendingRpc(supabase, "update_completed_action_occurrence_v1", {
    p_daily_action_id: input.actionId,
    p_title: input.title,
    p_completed_time: input.completedTime,
    p_actual_minutes: input.actualMinutes,
    p_due_local_date: input.dueLocalDate,
    p_due_local_time: input.dueLocalTime,
    p_recurrence_pattern: input.recurrencePattern,
    p_recurrence_days: input.recurrenceDays,
    p_reminder_offsets_minutes: input.reminderOffsets,
    p_details: input.details,
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

  if (!action.daily_plan_id) {
    throw new Error("Daily action is not part of a proposed plan.");
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
