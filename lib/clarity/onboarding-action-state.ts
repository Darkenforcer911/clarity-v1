import type { OnboardingStep } from "./onboarding";

export type OnboardingActionState = {
  status: "idle" | "success" | "error";
  step: OnboardingStep | null;
  message: string | null;
  fieldErrors?: Record<string, string[]>;
};

export const initialOnboardingActionState: OnboardingActionState = {
  status: "idle",
  step: null,
  message: null,
};
