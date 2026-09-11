export type OnboardingActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldError?: string;
  retryMessageId?: string;
  completedAt?: number;
};

export const initialOnboardingActionState: OnboardingActionState = {
  status: "idle",
  message: null,
};
