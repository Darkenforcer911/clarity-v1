import type { DailyAction } from "../daily-loop-queries";

export type PreviousDayOutcome =
  | "completed_previous_day"
  | "carry_to_today"
  | "choose_future_date"
  | "drop"
  | "needs_user_choice";

export type PreviousDaySuggestion = {
  actionId: string;
  outcome: PreviousDayOutcome;
  completedLocalTime?: string;
};

export type PreviousDayInterpretation =
  | {
      outcome: "needs_input";
      message: string;
    }
  | {
      outcome: "suggestions";
      suggestions: PreviousDaySuggestion[];
      unplannedProgress: string[];
      contextSummary: string | null;
      ongoingContextCandidate: {
        label: string;
        sourceText: string;
      } | null;
    };

export interface PreviousDayInterpreter {
  interpret(input: {
    explanation: string;
    actions: DailyAction[];
  }): Promise<PreviousDayInterpretation>;
}
