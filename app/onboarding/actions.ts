"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MAX_CLARITY_IMAGE_COUNT } from "@/lib/clarity/ai/clarity-attachments";
import type { OnboardingActionState } from "@/lib/clarity/onboarding-action-state";
import { runOnboardingConversationTurn } from "@/lib/clarity/onboarding-orchestrator";
import {
  appendOnboardingUserMessage,
  confirmOnboardingUnderstanding,
  loadOnboardingTurnContext,
  saveOnboardingBasicContext,
} from "@/lib/clarity/onboarding-service";

const basicContextSchema = z
  .object({
    preferredName: z
      .string()
      .trim()
      .min(1, "Tell Clarity what to call you.")
      .max(200, "Keep your preferred name under 200 characters."),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose your date of birth."),
    city: z
      .string()
      .trim()
      .min(1, "Enter your city.")
      .max(120, "Keep your city under 120 characters."),
    country: z
      .string()
      .trim()
      .min(1, "Enter your country.")
      .max(120, "Keep your country under 120 characters."),
    timezone: z.string().trim().refine(validTimezone, "Timezone could not be detected."),
  })
  .superRefine((value, context) => {
    if (!validDateOfBirth(value.dateOfBirth, value.timezone)) {
      context.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "Choose a valid date of birth.",
      });
    }
  });

const messageInputSchema = z
  .object({
    content: z
      .string()
      .trim()
      .max(10_000, "Keep this message under 10,000 characters."),
    attachmentIds: z.array(z.string().uuid()).max(MAX_CLARITY_IMAGE_COUNT),
  })
  .superRefine((value, context) => {
    if (!value.content && value.attachmentIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Write a message or add something first.",
      });
    }
  });

export async function saveOnboardingBasicContextAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const basicContext = basicContextSchema.parse({
      preferredName: formData.get("preferredName"),
      dateOfBirth: formData.get("dateOfBirth"),
      city: formData.get("city"),
      country: formData.get("country"),
      timezone: formData.get("timezone"),
    });
    await saveOnboardingBasicContext(basicContext);
    revalidatePath("/onboarding");
    return { status: "success", message: null, completedAt: Date.now() };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message: "Check the highlighted details and try again.",
        fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
        completedAt: Date.now(),
      };
    }
    console.error("Onboarding basics failed", error);
    return {
      status: "error",
      message: "Clarity couldn’t save those details yet. Try again.",
      completedAt: Date.now(),
    };
  }
}

export async function sendOnboardingMessageAction(
  _previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  let persistedMessageId: string | undefined;

  try {
    const input = messageInputSchema.parse({
      content: formData.get("message"),
      attachmentIds: formData.getAll("attachmentId").map(String),
    });
    const persisted = await appendOnboardingUserMessage(
      input.content,
      input.attachmentIds,
    );
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

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function validDateOfBirth(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !validTimezone(timezone)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return false;
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts()
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== "literal") parts[part.type] = part.value;
      return parts;
    }, {});
  const localToday = `${today.year}-${today.month}-${today.day}`;
  return value <= localToday;
}
