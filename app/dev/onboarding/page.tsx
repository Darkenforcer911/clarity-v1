import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  OnboardingFlow,
  OnboardingLoading,
} from "@/components/clarity/onboarding-flow";
import {
  AuthenticationRequiredError,
  getAuthenticatedUserAndProfile,
} from "@/lib/clarity/daily-loop-queries";
import {
  emptyOnboardingProgress,
  emptyOnboardingUnderstanding,
} from "@/lib/clarity/onboarding-intelligence";
import { onboardingPreviewEnabled } from "@/lib/clarity/onboarding-preview";

export default function OnboardingPreviewPage() {
  if (!onboardingPreviewEnabled) notFound();

  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingPreviewContent />
    </Suspense>
  );
}

async function OnboardingPreviewContent() {

  let profile;
  try {
    ({ profile } = await getAuthenticatedUserAndProfile());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/auth/login");
    throw error;
  }

  return (
    <OnboardingFlow
      initialState={{
        sessionId: null,
        status: "not_started",
        messages: [],
        understanding: emptyOnboardingUnderstanding(),
        progress: emptyOnboardingProgress(),
        synthesis: null,
        confirmedSnapshot: null,
        turnCount: 0,
        basicContextComplete: false,
        profile: {
          preferredName: profile.name?.trim() ?? "",
          dateOfBirth: profile.date_of_birth,
          age: null,
          city: profile.city?.trim() ?? "",
          country: profile.country?.trim() ?? "",
          timezone: profile.timezone,
        },
      }}
      mode="preview"
    />
  );
}
