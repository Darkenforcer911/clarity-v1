"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  appendClarityUserMessage,
  descriptorFromStoredMessage,
  loadRetryableUserMessage,
} from "@/lib/clarity/ai/clarity-conversation-service";
import {
  ClarityTranscriptionError,
  createClarityAttachmentUpload,
  discardClarityDraftAttachment,
  loadClarityAttachmentsForMessages,
  prepareClarityMessageForReasoning,
  transcribeClarityDraftAudio,
} from "@/lib/clarity/ai/clarity-attachment-service";
import {
  clarityAttachmentPreparationSchema,
  type ClarityMessageAttachment,
} from "@/lib/clarity/ai/clarity-attachments";
import {
  invocationFromDescriptor,
  type ClarityInvocationDescriptor,
} from "@/lib/clarity/ai/clarity-context-assembler";
import type { ClarityConversationActionState } from "@/lib/clarity/ai/clarity-conversation-action-state";
import { runClarityConversationTurn } from "@/lib/clarity/ai/clarity-conversation-orchestrator";
import { ClarityProviderError } from "@/lib/clarity/ai/clarity-provider";

const messageSchema = z.string().trim().max(8000);
const attachmentIdsSchema = z.array(z.string().uuid()).max(4);
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
    let attachments: ClarityMessageAttachment[];

    if (retryMessageId) {
      const retry = await loadRetryableUserMessage(retryMessageId);
      if (retry.alreadyAnswered) {
        revalidatePath("/clarity");
        return { error: null, success: true, completedAt: Date.now() };
      }
      persistedMessageId = retry.message.id;
      message = retry.message.content;
      attachments = retry.message.attachments;
      invocation = descriptorFromStoredMessage(retry.message);
    } else {
      message = messageSchema.parse(formData.get("message"));
      const attachmentIds = attachmentIdsSchema.parse(
        formData.getAll("attachmentId").map(String),
      );
      if (!message && attachmentIds.length === 0) {
        throw fieldValidationError("Write a message or add something first.");
      }
      invocation = parseInvocationDescriptor(formData);
      const persisted = await appendClarityUserMessage(
        message,
        invocation,
        attachmentIds,
      );
      persistedMessageId = persisted.message_id;
      const attachmentsByMessage = await loadClarityAttachmentsForMessages([
        persistedMessageId,
      ]);
      attachments = attachmentsByMessage.get(persistedMessageId) ?? [];
    }

    const prepared = await prepareClarityMessageForReasoning({
      content: message,
      attachments,
    });
    await runClarityConversationTurn({
      userMessageId: persistedMessageId,
      userMessage: prepared.userMessage,
      invocation,
      images: prepared.images,
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
          ? error instanceof ClarityProviderError &&
            error.code === "research_failure"
            ? "I couldn’t verify the current information just now. Your message is saved, so you can retry."
            : error instanceof ClarityTranscriptionError
              ? "I couldn’t transcribe that voice memo. It’s saved, so you can retry."
            : "Clarity couldn’t respond just now. Your message is saved, so you can retry."
          : "Clarity couldn’t save that message. Try again.",
      fieldError,
      ...(persistedMessageId ? { retryMessageId: persistedMessageId } : {}),
      completedAt: Date.now(),
    };
  }
}

export async function prepareClarityAttachmentAction(input: unknown) {
  return createClarityAttachmentUpload(
    clarityAttachmentPreparationSchema.parse(input),
  );
}

export async function discardClarityAttachmentAction(input: {
  attachmentId: string;
}) {
  await discardClarityDraftAttachment(input.attachmentId);
}

export async function transcribeClarityDictationAction(input: {
  attachmentId: string;
}): Promise<
  | { transcript: string; error: null }
  | { transcript: null; error: string }
> {
  try {
    return {
      transcript: await transcribeClarityDraftAudio(input.attachmentId),
      error: null,
    };
  } catch {
    return {
      transcript: null,
      error: "I couldn’t transcribe that. Try again.",
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

function fieldValidationError(message: string) {
  return new z.ZodError([
    { code: "custom", path: ["message"], message },
  ]);
}
