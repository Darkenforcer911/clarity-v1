"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ProposedReconciliationActionState } from "@/lib/clarity/proposed-reconciliation-state";
import {
  completeProposedAction,
  createCompletedPlanEvidence,
  deleteCompletedPlanEvidence,
  recordCalendarEventOutcome,
  updateCompletedPlanEvidence,
  ProposedPlanDateBoundaryError,
} from "@/lib/clarity/proposed-reconciliation-service";
import { calendarEventOutcomes } from "@/lib/clarity/calendar-commitments";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time.");

const completedItemSchema = z.object({
  title: z.string().trim().min(1, "Describe what you completed.").max(200),
  completedTime: z.union([timeSchema, z.literal("")]).transform((value) =>
    value === "" ? null : value,
  ),
});

const calendarOutcomeSchema = z
  .object({
    commitmentId: z.string().uuid(),
    occurrenceDate: z.iso.date(),
    outcome: z.enum(calendarEventOutcomes),
    note: z.string().trim().max(1000).transform((value) => value || null),
    newDate: z.union([z.iso.date(), z.literal("")]).transform((value) =>
      value === "" ? null : value,
    ),
    newTime: z.union([timeSchema, z.literal("")]).transform((value) =>
      value === "" ? null : value,
    ),
  })
  .refine(
    (value) =>
      value.outcome !== "rescheduled" ||
      (value.newDate !== null && value.newTime !== null),
    { message: "Choose the confirmed new date and time." },
  );

export async function createCompletedPlanEvidenceAction(
  _previousState: ProposedReconciliationActionState,
  formData: FormData,
): Promise<ProposedReconciliationActionState> {
  try {
    const planId = z.string().uuid().parse(formData.get("planId"));
    const input = completedItemSchema.parse({
      title: formData.get("title"),
      completedTime: formData.get("completedTime") ?? "",
    });
    await createCompletedPlanEvidence({ planId, ...input });
    revalidatePlan();
    return { error: null, savedAt: Date.now() };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCompletedPlanEvidenceAction(
  _previousState: ProposedReconciliationActionState,
  formData: FormData,
): Promise<ProposedReconciliationActionState> {
  try {
    const actionId = z.string().uuid().parse(formData.get("actionId"));
    const input = completedItemSchema.parse({
      title: formData.get("title"),
      completedTime: formData.get("completedTime") ?? "",
    });
    await updateCompletedPlanEvidence({ actionId, ...input });
    revalidatePlan();
    return { error: null, savedAt: Date.now() };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteCompletedPlanEvidenceAction(formData: FormData) {
  const actionId = z.string().uuid().parse(formData.get("actionId"));
  await deleteCompletedPlanEvidence(actionId);
  revalidatePlan();
}

export async function completeProposedActionFromPlanAction(
  _previousState: ProposedReconciliationActionState,
  formData: FormData,
): Promise<ProposedReconciliationActionState> {
  try {
    const actionId = z.string().uuid().parse(formData.get("actionId"));
    const completedTime = z
      .union([timeSchema, z.literal("")])
      .transform((value) => (value === "" ? null : value))
      .parse(formData.get("completedTime") ?? "");
    await completeProposedAction({ actionId, completedTime });
    revalidatePlan();
    return { error: null, savedAt: Date.now() };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordCalendarEventOutcomeAction(
  _previousState: ProposedReconciliationActionState,
  formData: FormData,
): Promise<ProposedReconciliationActionState> {
  try {
    const input = calendarOutcomeSchema.parse({
      commitmentId: formData.get("commitmentId"),
      occurrenceDate: formData.get("occurrenceDate"),
      outcome: formData.get("outcome"),
      note: formData.get("note") ?? "",
      newDate: formData.get("newDate") ?? "",
      newTime: formData.get("newTime") ?? "",
    });
    await recordCalendarEventOutcome(input);
    revalidatePlan();
    revalidatePath("/calendar");
    return { error: null, savedAt: Date.now() };
  } catch (error) {
    return actionError(error);
  }
}

function revalidatePlan() {
  revalidatePath("/today");
  revalidatePath("/today/plan");
}

function actionError(error: unknown): ProposedReconciliationActionState {
  if (error instanceof ProposedPlanDateBoundaryError) {
    return {
      error: null,
      dateBoundary: {
        endedLocalDate: error.endedLocalDate,
        currentLocalDate: error.currentLocalDate,
      },
    };
  }

  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Check the details and try again." };
  }

  return {
    error: error instanceof Error ? error.message : "Something went wrong. Try again.",
  };
}
