import type {
  PreviousDayOutcome,
} from "./ai/previous-day-interpreter";

export type ReconciliationSuggestion = {
  actionId: string;
  outcome: PreviousDayOutcome;
  completedAt?: string;
};

export type DayTransitionActionState = {
  error: string | null;
  fieldErrors?: Record<string, string[]>;
  explanation?: string;
  suggestions?: ReconciliationSuggestion[];
  unplannedProgress?: string[];
  contextSummary?: string | null;
  ongoingContextCandidate?: {
    label: string;
    sourceText: string;
  } | null;
};

export const initialDayTransitionActionState: DayTransitionActionState = {
  error: null,
};
