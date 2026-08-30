import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { getAuthenticatedUserAndProfile } from "./daily-loop-queries";
import {
  emptyOnboardingDraft,
  ONBOARDING_VERSION,
  parseOnboardingDraft,
  parseOnboardingStep,
  type OnboardingDraft,
  type OnboardingStep,
} from "./onboarding";

type PendingIdentityRpc = (
  functionName: "save_onboarding_identity_step_v1",
  args: {
    p_name: string;
    p_date_of_birth: string;
    p_city: string;
    p_country: string;
    p_timezone: string;
    p_onboarding_version: number;
    p_user_draft: Json;
  },
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type OnboardingPageState = {
  completed: boolean;
  step: OnboardingStep;
  draft: OnboardingDraft;
};

export async function getOnboardingPageState(): Promise<OnboardingPageState> {
  const { supabase, user, profile } = await getAuthenticatedUserAndProfile();
  const { data: session, error } = await supabase
    .from("onboarding_sessions")
    .select("current_step, user_draft")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    completed: profile.onboarding_completed,
    step: session ? parseOnboardingStep(session.current_step) : "entry",
    draft: session
      ? parseOnboardingDraft(session.user_draft, profile)
      : emptyOnboardingDraft(profile),
  };
}

export async function saveOnboardingStep(
  step: OnboardingStep,
  draft: OnboardingDraft,
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { error } = await supabase.rpc("save_onboarding_session", {
    p_onboarding_version: ONBOARDING_VERSION,
    p_current_step: step,
    p_user_draft: draft as Json,
  });

  if (error) throw new Error(error.message);
}

export async function saveOnboardingIdentity(
  identity: OnboardingDraft["identity"],
  draft: OnboardingDraft,
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const rpc = supabase.rpc as unknown as PendingIdentityRpc;
  const { error } = await rpc.call(
    supabase,
    "save_onboarding_identity_step_v1",
    {
      p_name: identity.name,
      p_date_of_birth: identity.dateOfBirth,
      p_city: identity.city,
      p_country: identity.country,
      p_timezone: identity.timezone,
      p_onboarding_version: ONBOARDING_VERSION,
      p_user_draft: draft as Json,
    },
  );

  if (error) throw new Error(error.message);
}
