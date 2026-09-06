"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  appendClarityUserMessage,
  descriptorFromStoredMessage,
  loadRetryableUserMessage,
} from "@/lib/clarity/ai/clarity-conversation-service";
import {
  invocationFromDescriptor,
  type ClarityInvocationDescriptor,
} from "@/lib/clarity/ai/clarity-context-assembler";
import type { ClarityConversationActionState } from "@/lib/clarity/ai/clarity-conversation-action-state";
import { runClarityConversationTurn } from "@/lib/clarity/ai/clarity-conversation-orchestrator";

const messageSchema = z.string().trim().min(1, "Write a message first.").max(8000);
const optionalUuid = z.union([z.literal(""), z.string().uuid()]);
const optionalDate = z.union([z.literal(""), z.iso.date()]);

export async function sendClarityMessageAction(
  _previousState: ClarityConversationActionState,
  formData: FormData,
): Promise<ClarityConversationActionState> {
  let persistedMessageId: string | undefined;

  try {
    const retryMessageId = String(formData.get("retryMessageId") ?? "");
    let message: string;
    let invocation: ClarityInvocationDescriptor;

    if (retryMessageId) {
      const retry = await loadRetryableUserMessage(retryMessageId);
      if (retry.alreadyAnswered) {
        revalidatePath("/clarity");
        return { error: null, success: true, completedAt: Date.now() };
      }
      persistedMessageId = retry.message.id;
      message = retry.message.content;
      invocation = descriptorFromStoredMessage(retry.message);
    } else {
      message = messageSchema.parse(formData.get("message"));
      invocation = parseInvocationDescriptor(formData);
      const persisted = await appendClarityUserMessage(message, invocation);
      persistedMessageId = persisted.message_id;
    }

    await runClarityConversationTurn({
      userMessageId: persistedMessageId,
      userMessage: message,
      invocation,
    });
    revalidatePath("/clarity");
    return { error: null, success: true, completedAt: Date.now() };
  } catch (error) {
    const fieldError = error instanceof z.ZodError
      ? error.issues[0]?.message
      : undefined;
    return {
      error: fieldError
        ? null
        : persistedMessageId
          ? "Clarity couldn’t respond just now. Your message is saved, so you can retry."
          : "Clarity couldn’t save that message. Try again.",
      fieldError,
      ...(persistedMessageId ? { retryMessageId: persistedMessageId } : {}),
      completedAt: Date.now(),
    };
  }
}

function parseInvocationDescriptor(
  formData: FormData,
): ClarityInvocationDescriptor {
  const raw = z
    .object({
      type: z.enum(["general", "action", "calendar_occurrence", "day"]),
      actionId: optionalUuid,
      calendarCommitmentId: optionalUuid,
      localDate: optionalDate,
    })
    .parse({
      type: String(formData.get("invocationType") ?? "general"),
      actionId: String(formData.get("actionId") ?? ""),
      calendarCommitmentId: String(
        formData.get("calendarCommitmentId") ?? "",
      ),
      localDate: String(formData.get("localDate") ?? ""),
    });
  const descriptor: ClarityInvocationDescriptor = {
    type: raw.type,
    actionId: raw.actionId || null,
    calendarCommitmentId: raw.calendarCommitmentId || null,
    localDate: raw.localDate || null,
  };

  if (descriptor.type !== "general" && !invocationFromDescriptor(descriptor)) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["invocation"],
        message: "This Clarity context is no longer available.",
      },
    ]);
  }
  if (
    descriptor.type === "general" &&
    (descriptor.actionId || descriptor.calendarCommitmentId || descriptor.localDate)
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["invocation"],
        message: "This Clarity context is invalid.",
      },
    ]);
  }
  return descriptor;
}
