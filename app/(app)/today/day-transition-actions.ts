"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";

import type { DayTransitionActionState } from "@/lib/clarity/day-transition-state";
import { dailyLoopService } from "@/lib/clarity/daily-loop-service";
import {
  formatWeekday,
  localDateTimeToIso,
} from "@/lib/clarity/date-time";
import {
  recapContextSummarySchema,
  previousDayExplanationSchema,
  previousDayResolutionSchema,
  previousDayUnplannedWorkSchema,
  type PreviousDayResolution,
  type PreviousDayUnplannedWork,
} from "@/lib/clarity/schemas";
import { loadTodayForRoute } from "./route-guards";

function transitionError(
  error: unknown,
  explanation?: string,
): DayTransitionActionState {
  if (error instanceof ZodError) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
      explanation,
    };
  }

  return {
    error: error instanceof Error ? error.message : "Something went wrong.",
    explanation,
  };
}

export async function interpretPreviousDayAction(
  _previousState: DayTransitionActionState,
  formData: FormData,
): Promise<DayTransitionActionState> {
  const explanation = String(formData.get("explanation") ?? "");

  try {
    const data = await loadTodayForRoute();
    const parsedExplanation =
      previousDayExplanationSchema.parse(explanation);
    const result = await dailyLoopService.interpretPreviousDay(
      data,
      parsedExplanation,
    );

    if (result.outcome === "needs_input") {
      return {
        error: result.message,
        explanation,
      };
    }

    return {
      error: null,
      explanation: parsedExplanation,
      suggestions: result.suggestions,
      unplannedProgress: result.unplannedProgress,
      contextSummary: result.contextSummary,
      ongoingContextCandidate: result.ongoingContextCandidate,
    };
  } catch (error) {
    return transitionError(error, explanation);
  }
}

export async function confirmPreviousDayAction(
  _previousState: DayTransitionActionState,
  formData: FormData,
): Promise<DayTransitionActionState> {
  let redirectTo = "/today";

  try {
    const data = await loadTodayForRoute();
    const transition = data.previousDayTransition;

    if (!transition || transition.kind !== "wrap_up") {
      throw new Error("There is no previous plan waiting for wrap-up.");
    }

    const resolutions: PreviousDayResolution[] = formData
      .getAll("actionId")
      .map((actionId) => {
        const id = String(actionId);
        const outcome = formData.get(`outcome:${id}`);
        const completedLocalTime = String(
          formData.get(`completedTime:${id}`) ?? "",
        );
        const completedAt =
          outcome === "finished" && completedLocalTime
            ? localDateTimeToIso(
                transition.localDate,
                completedLocalTime,
                data.profile.timezone,
              )
            : undefined;
        const completionCorrected =
          formData.get(`completionCorrected:${id}`) === "true";
        return previousDayResolutionSchema.parse({
          actionId: id,
          outcome,
          completedAt,
          completionCorrected,
          progressNote:
            outcome === "made_progress"
              ? formData.get(`progressNote:${id}`)
              : undefined,
          notDoneNote:
            outcome === "not_done"
              ? formData.get(`notDoneNote:${id}`)
              : undefined,
          closeReason:
            outcome === "closed"
              ? formData.get(`closeReason:${id}`)
              : undefined,
          closeContext:
            outcome === "closed"
              ? formData.get(`closeContext:${id}`)
              : undefined,
        });
      });
    const contextSummary =
      recapContextSummarySchema.parse(
        String(formData.get("contextSummary") ?? ""),
      ) || null;
    const unplannedItemIds = formData
      .getAll("unplannedItemId")
      .map((value) => z.string().uuid().parse(String(value)));

    if (new Set(unplannedItemIds).size !== unplannedItemIds.length) {
      throw new Error("A completed item was submitted more than once.");
    }

    const unplannedWork: PreviousDayUnplannedWork[] =
      unplannedItemIds.map((id) => {
        const completionTime = String(
          formData.get(`unplannedCompletionTime:${id}`) ?? "",
        );

        return previousDayUnplannedWorkSchema.parse({
          title: formData.get(`unplannedTitle:${id}`),
          outcome: "finished",
          completedAt: completionTime
            ? localDateTimeToIso(
                transition.localDate,
                completionTime,
                data.profile.timezone,
              )
            : undefined,
          completionTimeUnknown: !completionTime,
          estimatedMinutes: null,
        });
      });

    await dailyLoopService.reconcilePreviousDay(
      data,
      resolutions,
      unplannedWork,
      contextSummary,
    );
    redirectTo = `/today?notice=recap-captured&day=${encodeURIComponent(
      formatWeekday(transition.localDate),
    )}`;
    revalidatePath("/today");
    revalidatePath("/today/shape");
  } catch (error) {
    return transitionError(error);
  }

  redirect(redirectTo);
}

export async function recordPreviousDayAction(
  _previousState: DayTransitionActionState,
  formData: FormData,
): Promise<DayTransitionActionState> {
  const explanation = String(formData.get("explanation") ?? "");
  const skipped = formData.get("intent") === "skip";

  try {
    const data = await loadTodayForRoute();
    await dailyLoopService.recordHistoricalDay(
      data,
      explanation,
      skipped,
    );
    revalidatePath("/today");
  } catch (error) {
    return transitionError(error, explanation);
  }

  redirect("/today");
}

export async function recordReturnGapAction(
  _previousState: DayTransitionActionState,
  formData: FormData,
): Promise<DayTransitionActionState> {
  const contextSummary = String(
    formData.get("contextSummary") ?? "",
  );
  const nothingImportant =
    formData.get("intent") === "nothing-important";

  try {
    const data = await loadTodayForRoute();
    await dailyLoopService.recordReturnGap(data, {
      contextSummary: nothingImportant ? "" : contextSummary,
      nothingImportant,
    });
    revalidatePath("/today");
    revalidatePath("/today/shape");
  } catch (error) {
    return transitionError(error, contextSummary);
  }

  redirect("/today");
}

export async function decideBriefingContextAction(formData: FormData) {
  const input = z
    .object({
      dayRecordId: z.string().uuid(),
      decision: z.enum(["remembered", "once", "dismissed"]),
    })
    .parse({
      dayRecordId: formData.get("dayRecordId"),
      decision: formData.get("decision"),
    });
  const data = await loadTodayForRoute();

  await dailyLoopService.setBriefingContextDecision(
    data,
    input.dayRecordId,
    input.decision,
  );
  revalidatePath("/today");
  redirect("/today");
}
