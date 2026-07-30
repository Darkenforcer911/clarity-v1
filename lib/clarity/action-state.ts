export type AddActionFeedback = {
  classification: "ambiguous" | "user_unsure" | "invalid";
  message: string;
  originalInput?: string;
  clarificationQuestion?: string;
  exhausted?: boolean;
};

export type AddActionDraft = {
  title: string;
  actionType: string;
  estimatedMinutes: string | number;
  scheduledTime?: string;
  context?: string;
  clarificationQuestion?: string;
  clarificationAnswer?: string;
  recurrencePattern?: string;
  recurrenceDays?: number[];
};

export type AddActionTimeWarning = {
  message: "This may run past your planned sleep time.";
  shortenedMinutes: number;
};

export type AddActionContextPrompt = {
  actionId: string;
  suggestion: string;
  destination: string;
};

export type DailyLoopActionState = {
  error: string | null;
  fieldErrors?: Record<string, string[]>;
  success?: string;
  addActionFeedback?: AddActionFeedback;
  addActionDraft?: AddActionDraft;
  addActionTimeWarning?: AddActionTimeWarning;
  addActionContextPrompt?: AddActionContextPrompt;
};

export const initialDailyLoopActionState: DailyLoopActionState = {
  error: null,
};
