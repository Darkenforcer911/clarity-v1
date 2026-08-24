"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseCalendarCommitmentForm } from "@/lib/clarity/calendar-form";
import { parseDayCorrectionForm } from "@/lib/clarity/day-correction-form";
import type { CalendarActionState } from "@/lib/clarity/calendar-action-state";
import { submittedHistoricalCompletionTime } from "@/lib/clarity/historical-completion-time";
import {
  cancelCalendarCommitment,
  correctCalendarEventOccurrenceOutcome,
  correctHistoricalDailyActionOutcome,
  createCalendarCommitment,
  deleteCalendarCommitment,
  undoCalendarEventCompletion,
  updateCalendarCommitment,
  createDayCorrection,
  deleteDayCorrection,
  updateDayCorrection,
} from "@/lib/clarity/calendar-service";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export async function createCalendarCommitmentAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const parsed = parseCalendarCommitmentForm(formData);
  if (!parsed.success) {
    return { error: parsed.error, saved: false, version: previous.version + 1 };
  }

  try {
    await createCalendarCommitment(parsed.data);
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function updateCalendarCommitmentAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const parsed = parseCalendarCommitmentForm(formData);
  if (!parsed.success) {
    return { error: parsed.error, saved: false, version: previous.version + 1 };
  }

  try {
    const commitmentId = z.string().uuid().parse(formData.get("commitmentId"));
    await updateCalendarCommitment(commitmentId, parsed.data);
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function cancelCalendarCommitmentAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const commitmentId = z.string().uuid().parse(formData.get("commitmentId"));
    await cancelCalendarCommitment(commitmentId);
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function deleteCalendarCommitmentAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const commitmentId = z.string().uuid().parse(formData.get("commitmentId"));
    await deleteCalendarCommitment(commitmentId);
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function undoCalendarEventCompletionAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const input = z.object({
      commitmentId: z.string().uuid(),
      occurrenceDate: z.iso.date(),
    }).parse({
      commitmentId: formData.get("commitmentId"),
      occurrenceDate: formData.get("occurrenceDate"),
    });
    await undoCalendarEventCompletion(input);
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function correctHistoricalDailyActionOutcomeAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const parsed = z.object({
      actionId: z.string().uuid(),
      outcome: z.enum(["completed", "missed", "not_recorded"]),
      completedTime: z.union([localTimeSchema, z.literal("")]),
      note: z.string().trim().max(500),
    }).parse({
      actionId: formData.get("actionId"),
      outcome: formData.get("outcome"),
      completedTime: String(formData.get("completedTime") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
    await correctHistoricalDailyActionOutcome({
      actionId: parsed.actionId,
      status: parsed.outcome === "not_recorded" ? null : parsed.outcome,
      completedTime: submittedHistoricalCompletionTime({
        completed: parsed.outcome === "completed",
        selectedCompletionTime: parsed.completedTime,
      }),
      note: parsed.note || null,
    });
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function correctCalendarEventOccurrenceOutcomeAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const parsed = z.object({
      commitmentId: z.string().uuid(),
      occurrenceDate: z.iso.date(),
      outcome: z.enum(["attended", "missed", "cancelled", "not_recorded"]),
      completedTime: z.union([localTimeSchema, z.literal("")]),
      note: z.string().trim().max(1000),
    }).parse({
      commitmentId: formData.get("commitmentId"),
      occurrenceDate: formData.get("occurrenceDate"),
      outcome: formData.get("outcome"),
      completedTime: String(formData.get("completedTime") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
    await correctCalendarEventOccurrenceOutcome({
      commitmentId: parsed.commitmentId,
      occurrenceDate: parsed.occurrenceDate,
      outcome: parsed.outcome === "not_recorded" ? null : parsed.outcome,
      completedTime: submittedHistoricalCompletionTime({
        completed: parsed.outcome === "attended",
        selectedCompletionTime: parsed.completedTime,
      }),
      note: parsed.note || null,
    });
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function createDayCorrectionAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const parsed = parseDayCorrectionForm(formData);
  if (!parsed.success) {
    return { error: parsed.error, saved: false, version: previous.version + 1 };
  }
  try {
    await createDayCorrection(parsed.data);
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function updateDayCorrectionAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const parsed = parseDayCorrectionForm(formData);
  if (!parsed.success) {
    return { error: parsed.error, saved: false, version: previous.version + 1 };
  }
  try {
    const correctionId = z.string().uuid().parse(formData.get("correctionId"));
    await updateDayCorrection(correctionId, parsed.data);
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

export async function deleteDayCorrectionAction(
  previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const correctionId = z.string().uuid().parse(formData.get("correctionId"));
    await deleteDayCorrection(correctionId);
    revalidateCalendar();
    return { error: null, saved: true, version: previous.version + 1 };
  } catch (error) {
    return actionError(error, previous);
  }
}

function revalidateCalendar() {
  revalidatePath("/calendar");
  revalidatePath("/today/plan");
  revalidatePath("/today/active");
}

function actionError(error: unknown, previous: CalendarActionState) {
  return {
    error: error instanceof Error ? error.message : "Something went wrong.",
    saved: false,
    version: previous.version + 1,
  };
}
