import type { GeneratedPlan } from "../schemas";
import type { ReturnRecapInterpreter } from "./return-recap-interpreter";

export type ClarityAIInput = {
  userId: string;
  localDate: string;
  timezone: string;
  wokeAt: string;
  aimingToSleepAt: string;
  contextForToday: string | null;
  currentLocalTime: string;
  carriedActions: Array<{
    sourceActionId: string;
    title: string;
    estimatedMinutes: number;
    whyItExists: string;
    definitionOfDone: string;
    suggestedMethod: string;
    rescheduleCount: number;
  }>;
  previousDay: {
    explanation: string | null;
    completedCount: number;
    movedCount: number;
    droppedCount: number;
    historicalOutcomes: Array<{
      actionId: string;
      title: string;
      outcome: "made_progress" | "not_done";
      notDoneContext: string | null;
      progressDescription: string | null;
      remainingWork: string | null;
      blockerNote: string | null;
      approximateMinutes: number | null;
      approximateWorkTime: string | null;
      linkedContextLabel: string | null;
      linkedContextKind: string | null;
    }>;
    unplannedCarryoverCandidates: Array<{
      title: string;
      estimatedMinutes: number | null;
      progressLevel:
        | "started"
        | "part_way_through"
        | "nearly_finished"
        | "blocked"
        | null;
      progressNote: string | null;
    }>;
  } | null;
  returnGap: {
    gapStartDate: string;
    gapEndDate: string;
    contextSummary: string | null;
    nothingImportant: boolean;
    recordedAt: string;
  } | null;
};

export interface ClarityAI extends ReturnRecapInterpreter {
  buildPlan(input: ClarityAIInput): Promise<GeneratedPlan>;
}
