"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import { dailyLoopService } from "@/lib/clarity/daily-loop-service";
import {
  closeDayResolutionSchema,
  shapeTodaySchema,
  type CloseDayResolution,
} from "@/lib/clarity/schemas";
import type { DailyLoopActionState } from "@/lib/clarity/action-state";

function actionError(error: unknown): DailyLoopActionState {
  if (error instanceof ZodError) {
    const flattened = error.flatten();
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: flattened.fieldErrors as Record<string, string[]>,
    };
  }

  return {
    error: error instanceof Error ? error.message : "Something went wrong.",
  };
}

export async function recordAppOpenedAction(timezone: string) {
  try {
    await dailyLoopService.recordAppOpened(timezone);
  } catch {
    // Activity tracking should never interrupt the daily loop.
  }
}

export async function startMyDayAction() {
  await dailyLoopService.beginDayShaping();
  redirect("/today/shape");
}

export async function buildPlanAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const input = shapeTodaySchema.parse({
      wokeAt: String(formData.get("wokeAt") ?? ""),
      aimingToSleepAt: String(formData.get("aimingToSleepAt") ?? ""),
      contextForToday: String(formData.get("contextForToday") ?? ""),
      nothingElseToday: formData.get("nothingElseToday") === "on",
    });

    await dailyLoopService.buildPlan(input);
  } catch (error) {
    return actionError(error);
  }

  redirect("/today/plan");
}

export async function approvePlanAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  await dailyLoopService.approvePlan(planId);
  revalidatePath("/today");
  redirect("/today");
}

export async function setActionCompletionAction(formData: FormData) {
  const actionId = String(formData.get("actionId") ?? "");
  const completed = formData.get("completed") === "true";

  await dailyLoopService.setActionCompletion(actionId, completed);
  revalidatePath("/today");
}

export async function beginCloseDayAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  await dailyLoopService.beginDayClosing(planId);
  revalidatePath("/today");
  redirect("/today/close");
}

export async function undoCloseDayAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  await dailyLoopService.undoDayClose(planId);
  revalidatePath("/today");
  redirect("/today");
}

export async function finishDayAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const data = await dailyLoopService.getToday();
    const actionIds = formData.getAll("actionId").map(String);
    const resolutions: CloseDayResolution[] = actionIds.map((actionId) =>
      closeDayResolutionSchema.parse({
        actionId,
        outcome: formData.get(`outcome:${actionId}`),
        selectedDate:
          String(formData.get(`selectedDate:${actionId}`) ?? "") || undefined,
        resolutionNote:
          String(formData.get(`resolutionNote:${actionId}`) ?? "") ||
          undefined,
      }),
    );

    await dailyLoopService.finishDay(
      data,
      resolutions,
      String(formData.get("notes") ?? ""),
    );
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/today");
  redirect("/today/summary");
}
