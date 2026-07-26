export type DailyLoopActionState = {
  error: string | null;
  fieldErrors?: Record<string, string[]>;
};

export const initialDailyLoopActionState: DailyLoopActionState = {
  error: null,
};
