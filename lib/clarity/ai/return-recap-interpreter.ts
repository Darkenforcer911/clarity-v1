export type ReturnRecapConfidence = "high" | "medium" | "low";

export type ReturnRecapPlanAction = {
  id: string;
  title: string;
  existingOutcome:
    | "finished"
    | "made_progress"
    | "not_done"
    | "resolved_elsewhere"
    | "dropped"
    | null;
};

export type ReturnRecapPlanProposal = {
  actionId: string;
  outcome:
    | "finished"
    | "made_progress"
    | "not_done"
    | "resolved_elsewhere"
    | "needs_review";
  completionTime?: string;
  progressDetail?: string;
  resolutionDetail?: string;
  confidence: ReturnRecapConfidence;
  supportingPhrase?: string;
};

export type ReturnRecapGapUpdate = {
  id: string;
  kind:
    | "work_or_progress"
    | "change_or_blocker"
    | "commitment_or_deadline";
  title: string;
  description: string;
  approximateDate: string | null;
  exactTime: string | null;
  outcome: "finished" | "made_progress" | null;
  stillAffectsToday: boolean | null;
  dueDate: string | null;
  confidence: ReturnRecapConfidence;
  supportingPhrase: string;
};

export type ReturnRecapClarification = {
  id: string;
  phrase: string;
  question: string;
  suggestedActionIds: string[];
};

export type ReturnRecapInterpretation = {
  plannedActions: ReturnRecapPlanProposal[];
  gapUpdates: ReturnRecapGapUpdate[];
  clarifications: ReturnRecapClarification[];
};

export type ReturnRecapGapDateRange = {
  dates: string[];
  currentDate: string;
};

export interface ReturnRecapInterpreter {
  interpretReturnRecap(
    input: string,
    previousPlan: ReturnRecapPlanAction[],
    gapDateRange: ReturnRecapGapDateRange,
  ): Promise<ReturnRecapInterpretation>;
}
