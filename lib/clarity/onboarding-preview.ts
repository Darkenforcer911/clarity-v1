export const onboardingPreviewEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_ONBOARDING_PREVIEW === "true";
