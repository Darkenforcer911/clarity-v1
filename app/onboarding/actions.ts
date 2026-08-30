"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { OnboardingActionState } from "@/lib/clarity/onboarding-action-state";
import {
  CURRENT_REALITY_QUESTION_ID,
  isExplicitUnknown,
  type OnboardingStep,
} from "@/lib/clarity/onboarding";
import {
  getOnboardingPageState,
  saveOnboardingStep,
} from "@/lib/clarity/onboarding-service";

const nameFormSchema = z.object({
  name: z.string().trim().min(1, "Enter your name to continue.").max(200),
});

const realityFormSchema = z.object({
  currentReality: z
    .string()
    .max(10_000, "Keep this answer under 10,000 characters.")
    .refine(
      (value) => value.trim().length >= 2,
      "Tell Clarity a little about what your life looks like right now.",
    ),
});

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function actionError(error: unknown): OnboardingActionState {
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      step: null,
      message: "Check the highlighted fields and try again.",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  console.error("Onboarding step failed", error);
  return {
    status: "error",
    step: null,
    message: "Clarity couldn’t save that yet. Try again.",
  };
}

export async function startOnboardingAction(
  _previous: OnboardingActionState,
  _formData: FormData,
): Promise<OnboardingActionState> {
  void _previous;
  void _formData;
  try {
    const state = await getOnboardingPageState();
    await saveOnboardingStep("name", state.draft);
    revalidatePath("/onboarding");
  } catch (error) {
    return actionError(error);
  }

  redirect("/onboarding");
}

export async function saveOnboardingNameAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const { name } = nameFormSchema.parse({ name: formData.get("name") });
    const submittedTimezone = String(formData.get("timezone") ?? "");
    const state = await getOnboardingPageState();
    const draft = {
      ...state.draft,
      identity: {
        ...state.draft.identity,
        name,
        timezone: validTimezone(submittedTimezone)
          ? submittedTimezone
          : state.draft.identity.timezone,
      },
    };
    await saveOnboardingStep("name_welcome", draft);
    revalidatePath("/onboarding");
  } catch (error) {
    return actionError(error);
  }

  redirect("/onboarding");
}

export async function continueFromNameWelcomeAction(
  _previous: OnboardingActionState,
  _formData: FormData,
): Promise<OnboardingActionState> {
  void _previous;
  void _formData;
  try {
    const state = await getOnboardingPageState();
    await saveOnboardingStep("current_reality", state.draft);
    revalidatePath("/onboarding");
  } catch (error) {
    return actionError(error);
  }

  redirect("/onboarding");
}

export async function saveCurrentRealityAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const { currentReality: answer } = realityFormSchema.parse({
      currentReality: formData.get("currentReality"),
    });
    const state = await getOnboardingPageState();
    const explicitUnknown = isExplicitUnknown(answer);
    const draft = {
      ...state.draft,
      responses: {
        ...state.draft.responses,
        currentReality: {
          questionId: CURRENT_REALITY_QUESTION_ID,
          answer,
          explicitUnknown,
          answeredAt: new Date().toISOString(),
        },
      },
      explicitUnknowns: explicitUnknown
        ? [...new Set([...state.draft.explicitUnknowns, CURRENT_REALITY_QUESTION_ID])]
        : state.draft.explicitUnknowns.filter(
            (questionId) => questionId !== CURRENT_REALITY_QUESTION_ID,
          ),
    };

    await saveOnboardingStep("conversation_shell", draft);
    revalidatePath("/onboarding");
  } catch (error) {
    return actionError(error);
  }

  redirect("/onboarding");
}

export async function moveOnboardingBackAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const step = z
      .enum(["entry", "name", "current_reality"])
      .parse(formData.get("step")) as OnboardingStep;
    const state = await getOnboardingPageState();
    await saveOnboardingStep(step, state.draft);
    revalidatePath("/onboarding");
  } catch (error) {
    return actionError(error);
  }

  redirect("/onboarding");
}
