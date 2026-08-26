import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";

type LifeTargetConfidence = Database["public"]["Enums"]["life_target_confidence"];
type GoalStatus = Database["public"]["Enums"]["goal_status"];
type ProjectStatus = Database["public"]["Enums"]["project_status"];
type RoutineStatus = Database["public"]["Enums"]["routine_status"];
type RoutineCadence = Database["public"]["Enums"]["routine_cadence"];
type RoutineSkipPolicy = Database["public"]["Enums"]["routine_skip_policy"];
type EvidenceSignal = Database["public"]["Enums"]["life_evidence_signal"];

type LifeModelRpcClient = SupabaseClient<Database>;

async function callLifeModelMutation(
  name: string,
  args: Record<string, unknown>,
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await (supabase as LifeModelRpcClient).rpc(
    name as never,
    args as never,
  );

  if (error) throw new Error(error.message);
  return data;
}

export async function renameLifeArea(id: string, name: string) {
  await callLifeModelMutation("rename_life_area", {
    p_life_area_id: id,
    p_name: name,
  });
}

export async function reorderLifeAreas(ids: string[]) {
  await callLifeModelMutation("reorder_life_areas", {
    p_ordered_life_area_ids: ids,
  });
}

export async function archiveLifeArea(id: string) {
  await callLifeModelMutation("archive_life_area", { p_life_area_id: id });
}

export async function setLifeAreaCurrentState(input: {
  lifeAreaId: string;
  summary: string;
  asOfDate: string;
}) {
  await callLifeModelMutation("set_life_area_current_state", {
    p_life_area_id: input.lifeAreaId,
    p_summary: input.summary,
    p_as_of_date: input.asOfDate,
    p_created_via: "user_stated",
    p_source_proposal_id: null,
  });
}

export async function updateGoal(input: {
  id: string;
  title: string;
  desiredOutcome: string;
  targetStartDate: string | null;
  targetEndDate: string | null;
  targetConfidence: LifeTargetConfidence | null;
}) {
  await callLifeModelMutation("update_goal", {
    p_goal_id: input.id,
    p_title: input.title,
    p_desired_outcome: input.desiredOutcome,
    p_target_start_date: input.targetStartDate,
    p_target_end_date: input.targetEndDate,
    p_target_confidence: input.targetConfidence,
  });
}

export async function transitionGoalStatus(input: {
  id: string;
  status: GoalStatus;
  rationale: string | null;
}) {
  await callLifeModelMutation("transition_goal_status", {
    p_goal_id: input.id,
    p_new_status: input.status,
    p_rationale: input.rationale,
    p_evidence_summary: null,
    p_consequence_summary: null,
    p_replacement_goal_id: null,
    p_created_via: "user_stated",
    p_source_proposal_id: null,
  });
}

export async function updateProject(input: {
  id: string;
  title: string;
  desiredOutcome: string;
  goalId: string | null;
  parentProjectId: string | null;
  targetStartDate: string | null;
  targetEndDate: string | null;
  targetConfidence: LifeTargetConfidence | null;
}) {
  await callLifeModelMutation("update_project", {
    p_project_id: input.id,
    p_title: input.title,
    p_desired_outcome: input.desiredOutcome,
    p_goal_id: input.goalId,
    p_parent_project_id: input.parentProjectId,
    p_target_start_date: input.targetStartDate,
    p_target_end_date: input.targetEndDate,
    p_target_confidence: input.targetConfidence,
  });
}

export async function transitionProjectStatus(id: string, status: ProjectStatus) {
  await callLifeModelMutation("transition_project_status", {
    p_project_id: id,
    p_new_status: status,
  });
}

export async function updateRoutine(input: {
  id: string;
  title: string;
  cadence: RoutineCadence;
  estimatedMinutes: number;
  goalId: string | null;
  projectId: string | null;
  cadenceCount: number | null;
  weekdays: number[];
  preferredTime: string | null;
  skipPolicy: RoutineSkipPolicy;
}) {
  await callLifeModelMutation("update_routine", {
    p_routine_id: input.id,
    p_title: input.title,
    p_cadence: input.cadence,
    p_estimated_minutes: input.estimatedMinutes,
    p_goal_id: input.goalId,
    p_project_id: input.projectId,
    p_cadence_count: input.cadenceCount,
    p_weekdays: input.weekdays,
    p_preferred_time: input.preferredTime,
    p_skip_policy: input.skipPolicy,
  });
}

export async function transitionRoutineStatus(id: string, status: RoutineStatus) {
  await callLifeModelMutation("transition_routine_status", {
    p_routine_id: id,
    p_new_status: status,
  });
}

export async function updateCurrentContext(input: {
  id: string;
  title: string;
  planningImpact: string;
  startedOn: string;
  expectedEndStart: string | null;
  expectedEndEnd: string | null;
}) {
  await callLifeModelMutation("update_current_context", {
    p_current_context_id: input.id,
    p_title: input.title,
    p_planning_impact: input.planningImpact,
    p_started_on: input.startedOn,
    p_expected_end_start: input.expectedEndStart,
    p_expected_end_end: input.expectedEndEnd,
  });
}

export async function endCurrentContext(id: string) {
  await callLifeModelMutation("end_current_context", {
    p_current_context_id: id,
  });
}

export async function correctLifeEvidence(input: {
  id: string;
  summary: string;
  occurredOn: string;
  signal: EvidenceSignal;
}) {
  await callLifeModelMutation("correct_life_evidence", {
    p_life_evidence_id: input.id,
    p_summary: input.summary,
    p_occurred_on: input.occurredOn,
    p_signal: input.signal,
  });
}

export async function archiveLifeEvidence(id: string) {
  await callLifeModelMutation("archive_life_evidence", {
    p_life_evidence_id: id,
  });
}

export async function createMentorLifeModelChangeProposal(input: {
  userFacingSummary: string;
  proposedChanges: { operations: Array<Record<string, unknown>> };
}) {
  const result = await callLifeModelMutation(
    "create_life_model_change_proposal",
    {
      p_proposal_source: "mentor",
      p_user_facing_summary: input.userFacingSummary,
      p_proposed_changes: input.proposedChanges,
      p_onboarding_session_id: null,
    },
  );

  if (typeof result !== "string") {
    throw new Error("Clarity could not create the Life proposal.");
  }
  return result;
}

export async function confirmLifeModelChangeProposal(id: string) {
  return callLifeModelMutation("confirm_life_model_change_proposal", {
    p_life_model_change_proposal_id: id,
  });
}

export async function rejectLifeModelChangeProposal(id: string) {
  await callLifeModelMutation("reject_life_model_change_proposal", {
    p_life_model_change_proposal_id: id,
  });
}
