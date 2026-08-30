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
import { emptyOnboardingDraft } from "@/lib/clarity/onboarding";
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
        completed: false,
        step: "entry",
        draft: emptyOnboardingDraft(profile),
      }}
      mode="preview"
    />
  );
}
