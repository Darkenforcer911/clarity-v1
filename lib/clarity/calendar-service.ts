import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalDate } from "./date-time";
import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import {
  parseCalendarCommitments,
  type CalendarCommitment,
  type CalendarCommitmentType,
  type CalendarRecurrencePreset,
} from "./calendar-commitments";
import { filterActiveCalendarCommitments } from "./calendar-commitment-visibility";
import {
  parseDayCorrections,
  type DayCorrection,
} from "./day-corrections";
import type { DayCorrectionInput } from "./day-correction-form";
import { daySummarySchema, type DaySummary } from "./schemas";
import type { Database } from "@/lib/supabase/database.types";
import {
  getCalendarStripDates,
  resolveCalendarSelectedDate,
} from "./calendar-rules";
import {
  getReminderCommitmentKind,
  validateReminderSchedule,
} from "./calendar-reminders";
import type { CalendarRecurrenceRule } from "./calendar-recurrence";
import {
  parseHistoricalActionOutcomeRevisions,
  type HistoricalActionOutcomeRevision,
} from "./historical-action-outcomes";
import {
  getVisibleCalendarDailyActions,
  type CalendarDailyAction,
  type CalendarDailyActionWithPlan,
} from "./calendar-daily-actions";

type RpcClient = SupabaseClient<Database>;

export type CalendarCommitmentInput = {
  commitmentType: CalendarCommitmentType;
  title: string;
  localDate: string;
  eventStartTime: string | null;
  deadlineDueTime: string | null;
  durationMinutes: number | null;
  recurrence: CalendarRecurrencePreset;
  recurrenceRule: CalendarRecurrenceRule;
  details: string | null;
  reminderOffsetsMinutes: number[];
};

export type CalendarHistoricalRecord = {
  planExists: boolean;
  planStatus: string | null;
  gapAcknowledged: boolean;
  summary: DaySummary | null;
  notes: string | null;
  actionOutcomeRevisions: HistoricalActionOutcomeRevision[];
  actionResolutionNotes: Record<string, string>;
  completedEvidence: Record<
    string,
    { actualMinutes: number | null; details: string | null }
  >;
};

export async function getCalendarPageData(requestedDate?: string) {
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const today = getLocalDate(profile.timezone);
  const selectedDate = resolveCalendarSelectedDate(requestedDate, today);
  const isPast = selectedDate < today;
  const [commitments, dailyActions, corrections, historicalRecord] =
    await Promise.all([
      getCalendarCommitmentsForDate(supabase, selectedDate),
      getCalendarDailyActionsForDate(
        supabase,
        user.id,
        selectedDate,
        today,
      ),
      isPast
        ? getDayCorrectionsForDate(supabase, selectedDate)
        : Promise.resolve([]),
      isPast
        ? getHistoricalRecord(supabase, user.id, selectedDate)
        : Promise.resolve(null),
    ]);
  const resolvedHistoricalRecord = historicalRecord
    ? {
        ...historicalRecord,
        actionResolutionNotes: Object.fromEntries(
          dailyActions.flatMap((action) =>
            action.calendar_projection !== "due" && action.resolution_note
              ? [[action.id, action.resolution_note]]
              : [],
          ),
        ),
        completedEvidence: Object.fromEntries(
          dailyActions.flatMap((action) =>
            action.calendar_projection !== "due" &&
            action.completion_evidence_only
              ? [
                  [
                    action.id,
                    {
                      actualMinutes: action.actual_minutes,
                      details: action.details,
                    },
                  ],
                ]
              : [],
          ),
        ),
      }
    : null;

  return {
    profile,
    today,
    selectedDate,
    commitments: isPast
      ? commitments
      : filterActiveCalendarCommitments(commitments),
    dailyActions:
      isPast && resolvedHistoricalRecord?.summary
        ? dailyActions.filter(
            (action) => action.calendar_projection === "due",
          )
        : dailyActions,
    corrections,
    historicalRecord: resolvedHistoricalRecord,
    stripDates: getCalendarStripDates(selectedDate),
  };
}

async function getCalendarDailyActionsForDate(
  supabase: RpcClient,
  authenticatedUserId: string,
  localDate: string,
  today: string,
): Promise<CalendarDailyAction[]> {
  if (localDate >= today) {
    const materialized = await callCalendarRpc(
      supabase,
      "materialize_routine_action_occurrences",
      { p_local_date: localDate },
    );
    if (materialized.error) throw new Error(materialized.error.message);
  }

  const { data, error } = await supabase
    .from("daily_actions")
    .select("*, daily_plans!daily_actions_plan_owner_fkey(status, approved_at)")
    .eq("user_id", authenticatedUserId)
    .or(`local_date.eq.${localDate},due_local_date.eq.${localDate}`)
    .neq("status", "removed")
    .order("sort_order");

  if (error) throw new Error(error.message);

  const projected = (data ?? []).map((action) => ({
    ...action,
    calendar_projection:
      action.local_date === localDate ? "occurrence" as const : "due" as const,
  })) as CalendarDailyActionWithPlan[];

  return getVisibleCalendarDailyActions(
    projected,
    today,
  );
}

export async function getCalendarCommitmentsForDate(
  supabase: RpcClient,
  localDate: string,
): Promise<CalendarCommitment[]> {
  const { data, error } = await callCalendarRpc(
    supabase,
    "get_calendar_commitments_for_date",
    { p_local_date: localDate },
  );
  if (error) throw new Error(error.message);
  return parseCalendarCommitments(data);
}

export async function createCalendarCommitment(
  input: CalendarCommitmentInput,
) {
  const { supabase, profile } = await getAuthenticatedUserAndProfile();
  assertReminderScheduleIsFuture(input, profile.timezone);
  const { error } = await callCalendarRpc(
    supabase,
    "create_calendar_commitment",
    rpcInput(input),
  );
  if (error) throw new Error(error.message);
}

export async function updateCalendarCommitment(
  commitmentId: string,
  input: CalendarCommitmentInput,
) {
  const { supabase, profile } = await getAuthenticatedUserAndProfile();
  assertReminderScheduleIsFuture(input, profile.timezone);
  const { error } = await callCalendarRpc(
    supabase,
    "update_calendar_commitment",
    { p_calendar_commitment_id: commitmentId, ...rpcInput(input) },
  );
  if (error) throw new Error(error.message);
}

function assertReminderScheduleIsFuture(
  input: CalendarCommitmentInput,
  timezone: string,
) {
  const kind = getReminderCommitmentKind(
    input.commitmentType,
    input.commitmentType === "event" || input.deadlineDueTime !== null,
  );
  const result = validateReminderSchedule(
    input.reminderOffsetsMinutes,
    kind,
    {
      occurrenceDate: input.localDate,
      wallClockTime:
        input.commitmentType === "event"
          ? input.eventStartTime
          : input.deadlineDueTime,
      timezone,
      now: new Date(),
      recurrence: input.recurrence,
      recurrenceRule: input.recurrenceRule,
    },
  );
  if (!result.success) throw new Error(result.error);
}

export async function cancelCalendarCommitment(commitmentId: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await callCalendarRpc(
    supabase,
    "cancel_calendar_commitment",
    { p_calendar_commitment_id: commitmentId },
  );
  if (error) throw new Error(error.message);
}

export async function deleteCalendarCommitment(commitmentId: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await callCalendarRpc(
    supabase,
    "delete_calendar_commitment",
    { p_calendar_commitment_id: commitmentId },
  );
  if (error) throw new Error(error.message);
}

export async function undoCalendarEventCompletion(input: {
  commitmentId: string;
  occurrenceDate: string;
}) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await callCalendarRpc(
    supabase,
    "undo_calendar_event_completion",
    {
      p_calendar_commitment_id: input.commitmentId,
      p_occurrence_date: input.occurrenceDate,
    },
  );
  if (error) throw new Error(error.message);
}

export async function correctHistoricalDailyActionOutcome(input: {
  actionId: string;
  status: "completed" | "missed" | null;
  completedTime: string | null;
  note: string | null;
}) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await callCalendarRpc(
    supabase,
    "correct_historical_daily_action_outcome",
    {
      p_daily_action_id: input.actionId,
      p_new_status: input.status,
      p_completed_time: input.completedTime,
      p_correction_note: input.note,
    },
  );
  if (error) throw new Error(error.message);
}

export async function correctCalendarEventOccurrenceOutcome(input: {
  commitmentId: string;
  occurrenceDate: string;
  outcome: "attended" | "missed" | "cancelled" | null;
  completedTime: string | null;
  note: string | null;
}) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await callCalendarRpc(
    supabase,
    "correct_calendar_event_occurrence_outcome",
    {
      p_calendar_commitment_id: input.commitmentId,
      p_occurrence_date: input.occurrenceDate,
      p_new_outcome: input.outcome,
      p_completed_time: input.completedTime,
      p_outcome_note: input.note,
    },
  );
  if (error) throw new Error(error.message);
}

export async function createDayCorrection(input: DayCorrectionInput) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await callCalendarRpc(supabase, "create_day_correction", {
    p_local_date: input.localDate,
    ...correctionRpcInput(input),
  });
  if (error) throw new Error(error.message);
}

export async function updateDayCorrection(
  correctionId: string,
  input: DayCorrectionInput,
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await callCalendarRpc(supabase, "update_day_correction", {
    p_day_correction_id: correctionId,
    ...correctionRpcInput(input),
  });
  if (error) throw new Error(error.message);
}

export async function deleteDayCorrection(correctionId: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await callCalendarRpc(supabase, "delete_day_correction", {
    p_day_correction_id: correctionId,
  });
  if (error) throw new Error(error.message);
}

function rpcInput(input: CalendarCommitmentInput) {
  return {
    p_commitment_type: input.commitmentType,
    p_title: input.title,
    p_local_date: input.localDate,
    p_event_start_time: input.eventStartTime,
    p_deadline_due_time: input.deadlineDueTime,
    p_duration_minutes: input.durationMinutes,
    p_recurrence: input.recurrence,
    p_recurrence_unit: input.recurrenceRule.unit,
    p_recurrence_interval: input.recurrenceRule.interval,
    p_recurrence_weekdays: input.recurrenceRule.weekdays,
    p_details: input.details,
    p_reminder_offsets_minutes: input.reminderOffsetsMinutes,
  };
}

function correctionRpcInput(input: DayCorrectionInput) {
  return {
    p_correction_type: input.correctionType,
    p_title: input.title,
    p_occurred_time: input.occurredTime,
    p_duration_minutes: input.durationMinutes,
    p_details: input.details,
  };
}

async function getDayCorrectionsForDate(
  supabase: RpcClient,
  localDate: string,
): Promise<DayCorrection[]> {
  const { data, error } = await callCalendarRpc(
    supabase,
    "get_day_corrections_for_date",
    { p_local_date: localDate },
  );
  if (error) throw new Error(error.message);
  return parseDayCorrections(data);
}

async function getHistoricalRecord(
  supabase: RpcClient,
  authenticatedUserId: string,
  localDate: string,
): Promise<CalendarHistoricalRecord> {
  const [planResult, gapResult, revisionsResult] = await Promise.all([
    supabase
      .from("daily_plans")
      .select("status, day_records(progress_recorded, notes)")
      .eq("user_id", authenticatedUserId)
      .eq("local_date", localDate)
      .maybeSingle(),
    supabase
      .from("return_gap_records")
      .select("id")
      .eq("user_id", authenticatedUserId)
      .lte("gap_start_date", localDate)
      .gte("gap_end_date", localDate)
      .limit(1)
      .maybeSingle(),
    callCalendarRpc(
      supabase,
      "get_historical_daily_action_outcomes_for_date",
      { p_local_date: localDate },
    ),
  ]);
  if (planResult.error) throw new Error(planResult.error.message);
  if (gapResult.error) throw new Error(gapResult.error.message);
  if (revisionsResult.error) throw new Error(revisionsResult.error.message);

  const data = planResult.data;
  const record = data?.day_records?.[0] ?? null;
  const parsed = record
    ? daySummarySchema.safeParse(record.progress_recorded)
    : null;
  return {
    planExists: data !== null,
    planStatus: data?.status ?? null,
    gapAcknowledged: gapResult.data !== null,
    summary: parsed?.success ? parsed.data : null,
    notes: record?.notes ?? null,
    actionOutcomeRevisions: parseHistoricalActionOutcomeRevisions(
      revisionsResult.data,
    ),
    actionResolutionNotes: {},
    completedEvidence: {},
  };
}

async function callCalendarRpc(
  supabase: RpcClient,
  name: string,
  args: Record<string, unknown>,
) {
  const rpc = supabase.rpc as unknown as (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
  return rpc.call(supabase, name, args);
}
