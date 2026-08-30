import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  OnboardingFlow,
  OnboardingLoading,
} from "@/components/clarity/onboarding-flow";
import { AuthenticationRequiredError } from "@/lib/clarity/daily-loop-queries";
import { getOnboardingPageState } from "@/lib/clarity/onboarding-service";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingContent />
    </Suspense>
  );
}

async function OnboardingContent() {
  let state;
  try {
    state = await getOnboardingPageState();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    throw error;
  }

  if (state.completed) redirect("/today");

  return <OnboardingFlow initialState={state} mode="live" />;
}
