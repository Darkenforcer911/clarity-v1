"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";

import { dailyLoopService } from "@/lib/clarity/daily-loop-service";
import {
  closeDayResolutionSchema,
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
  const result = await dailyLoopService.beginDayShaping();

  switch (result.outcome) {
    case "started": {
      await dailyLoopService.ensureInitialPlanProposal();
      redirect("/today/plan");
    }
    case "quick_recap_required":
      redirect("/today/catch-up");
    case "catch_up_required":
    case "get_current_required":
      redirect("/today/catch-up/gap");
    case "current_day_already_started": {
      if (result.planStatus === "unshaped") {
        await dailyLoopService.ensureInitialPlanProposal();
        redirect("/today/plan");
      }

      if (result.planStatus === "proposed") {
        redirect("/today/plan");
      }

      redirect("/today");
    }
  }
}

export async function approvePlanAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const allowEmptyPlan = formData.get("allowEmptyPlan") === "true";
  await dailyLoopService.approvePlan(planId, allowEmptyPlan);
  revalidatePath("/today");
  redirect("/today/active");
}

export async function setActionCompletionAction(formData: FormData) {
  const actionId = String(formData.get("actionId") ?? "");
  const completed = formData.get("completed") === "true";

  await dailyLoopService.setActionCompletion(actionId, completed);
  revalidatePath("/today");
  revalidatePath("/today/plan");
  revalidatePath("/today/active");
  revalidatePath("/calendar");
  revalidatePath(`/today/actions/${actionId}`);
}

export async function markActionIncompleteAction(formData: FormData) {
  const actionId = z.string().uuid().parse(formData.get("actionId"));
  const returnToDetail = formData.get("returnTo") === "detail";

  await dailyLoopService.setActionCompletion(actionId, false);
  revalidatePath("/today");
  revalidatePath("/today/plan");
  revalidatePath("/today/active");
  revalidatePath("/calendar");
  revalidatePath(`/today/actions/${actionId}`);
  redirect(returnToDetail ? `/today/actions/${actionId}` : "/today");
}

export async function beginCloseDayAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  await dailyLoopService.beginDayClosing(planId);
  revalidatePath("/today");
  redirect("/today/close");
}

export async function cancelCloseDayAction(formData: FormData) {
  const planId = z.string().uuid().parse(formData.get("planId"));
  await dailyLoopService.cancelDayClosing(planId);
  revalidatePath("/today");
  revalidatePath("/today/close");
  redirect("/today");
}

export async function undoCloseDayAction(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  await dailyLoopService.undoDayClose(planId);
  revalidatePath("/today");
  redirect("/today");
}

export async function undoCloseDayFromSummaryAction(
  _previousState: DailyLoopActionState,
  formData: FormData,
): Promise<DailyLoopActionState> {
  try {
    const planId = z.string().uuid().parse(formData.get("planId"));
    await dailyLoopService.undoDayClose(planId);
    revalidatePath("/today");
    revalidatePath("/today/active");
    revalidatePath("/today/summary");
  } catch (error) {
    return actionError(error);
  }

  redirect("/today/active");
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
