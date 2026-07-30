import type { ReturnRecapInterpretation } from "@/lib/clarity/ai/return-recap-interpreter";
import { progressExplanationError } from "@/lib/clarity/recap-validation";
import type { HistoricalActivity } from "./historical-activity-form";
import type { RecapActionDraft } from "./recap-action-panel";
import type { RecapDayContext } from "./recap-context-review";

export function applyRecapInterpretation(
  currentDrafts: Record<string, RecapActionDraft>,
  interpretation: ReturnRecapInterpretation,
) {
  const next = { ...currentDrafts };

  for (const proposal of interpretation.plannedActions) {
    const current = next[proposal.actionId];

    if (!current) {
      continue;
    }

    if (proposal.outcome === "needs_review") {
      next[proposal.actionId] = {
        ...current,
        outcome: undefined,
        outcomeConfirmed: false,
        supportingPhrase: proposal.supportingPhrase ?? "",
      };
      continue;
    }

    const supportingPhrase = proposal.supportingPhrase ?? "";
    const progressNote =
      proposal.outcome === "made_progress"
        ? proposal.progressDetail ?? supportingPhrase
        : "";
    const resolvedElsewhereNote =
      proposal.outcome === "resolved_elsewhere"
        ? proposal.resolutionDetail ?? supportingPhrase
        : "";
    const completionTime =
      proposal.outcome === "finished"
        ? proposal.completionTime ??
          (current.outcome === "finished"
            ? current.completionTime
            : "")
        : current.completionTime;
    const outcomeConfirmed =
      proposal.outcome === "made_progress"
        ? progressExplanationError(progressNote) === null
        : true;

    next[proposal.actionId] = {
      ...current,
      outcome: proposal.outcome,
      outcomeConfirmed,
      completionTime,
      timeUnknown:
        proposal.outcome === "finished"
          ? !completionTime
          : current.timeUnknown,
      completionCorrected:
        current.completionCorrected ||
        Boolean(proposal.completionTime),
      progressNote,
      resolvedElsewhereNote,
      supportingPhrase,
    };
  }

  return next;
}

export function activitiesFromRecapInterpretation(
  interpretation: ReturnRecapInterpretation,
): HistoricalActivity[] {
  return interpretation.gapUpdates.flatMap((update) => {
    if (
      update.kind !== "work_or_progress" ||
      !update.outcome ||
      (update.outcome === "made_progress" &&
        progressExplanationError(update.description) !== null)
    ) {
      return [];
    }

    return [
      {
        id: update.id,
        title: update.title,
        outcome: update.outcome,
        completionTime: update.exactTime ?? "",
        timeUnknown:
          update.outcome === "finished" && !update.exactTime,
        estimatedMinutes: null,
        progressNote:
          update.outcome === "made_progress"
            ? update.description
            : "",
        remainingWork: "",
        approximateDate: update.approximateDate,
      },
    ];
  });
}

export function contextsFromRecapInterpretation(
  interpretation: ReturnRecapInterpretation,
): RecapDayContext[] {
  return interpretation.gapUpdates.flatMap((update) => {
    const invalidProgress =
      update.outcome === "made_progress" &&
      progressExplanationError(update.description) !== null;

    if (update.kind === "work_or_progress" && !invalidProgress) {
      return [];
    }

    return [
      {
        id: `context-${update.id}`,
        text: update.description,
      },
    ];
  });
}
