"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { OnboardingActionState } from "@/lib/clarity/onboarding-action-state";
import { runOnboardingConversationTurn } from "@/lib/clarity/onboarding-orchestrator";
import {
  appendOnboardingUserMessage,
  confirmOnboardingUnderstanding,
  loadOnboardingTurnContext,
} from "@/lib/clarity/onboarding-service";

const messageSchema = z
  .string()
  .trim()
  .min(1, "Tell Clarity what’s going on first.")
  .max(10_000, "Keep this message under 10,000 characters.");

export async function sendOnboardingMessageAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  let persistedMessageId: string | undefined;

  try {
    const content = messageSchema.parse(formData.get("message"));
    const persisted = await appendOnboardingUserMessage(content);
    persistedMessageId = persisted.message_id;
    await runOnboardingConversationTurn({ userMessageId: persistedMessageId });
    revalidatePath("/onboarding");
    return { status: "success", message: null, completedAt: Date.now() };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message: null,
        fieldError: error.issues[0]?.message,
        completedAt: Date.now(),
      };
    }
    console.error("Onboarding turn failed", error);
    if (persistedMessageId) revalidatePath("/onboarding");
    return {
      status: "error",
      message: persistedMessageId
        ? "Clarity couldn’t respond just now. Your answer is saved, so you can retry."
        : "Clarity couldn’t save that yet. Try again.",
      ...(persistedMessageId ? { retryMessageId: persistedMessageId } : {}),
      completedAt: Date.now(),
    };
  }
}

export async function retryOnboardingMessageAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const messageId = z.string().uuid().parse(formData.get("retryMessageId"));
    const context = await loadOnboardingTurnContext(messageId);
    if (!context.alreadyAnswered) {
      await runOnboardingConversationTurn({ userMessageId: messageId });
    }
    revalidatePath("/onboarding");
    return { status: "success", message: null, completedAt: Date.now() };
  } catch (error) {
    console.error("Onboarding retry failed", error);
    return {
      status: "error",
      message: "Clarity still couldn’t respond. Try again when you’re ready.",
      retryMessageId: String(formData.get("retryMessageId") ?? ""),
      completedAt: Date.now(),
    };
  }
}

export async function confirmOnboardingAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const sessionId = z.string().uuid().parse(formData.get("sessionId"));
    await confirmOnboardingUnderstanding(sessionId);
    revalidatePath("/onboarding");
    revalidatePath("/today");
    return { status: "success", message: null, completedAt: Date.now() };
  } catch (error) {
    console.error("Onboarding confirmation failed", error);
    return {
      status: "error",
      message: "Clarity couldn’t confirm that yet. Try again.",
      completedAt: Date.now(),
    };
  }
}
