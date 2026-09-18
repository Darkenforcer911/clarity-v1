import "server-only";

import { z } from "zod";

import type { Json, Tables } from "@/lib/supabase/database.types";
import { getAuthenticatedUserAndProfile } from "../daily-loop-queries";
import { loadClarityAttachmentsForMessages } from "./clarity-attachment-service";
import type { ClarityMessageAttachment } from "./clarity-attachments";
import {
  loadClarityProposalsForAssistantMessages,
} from "./clarity-proposal-service";
import type {
  ClarityChangeProposal,
  ValidatedClarityProposalCandidate,
} from "./clarity-proposal";
import type {
  ClarityConversationResponse,
} from "./clarity-response-schema";
import type {
  ClarityInvocationDescriptor,
} from "./clarity-context-assembler";
import type { ClarityProviderResult } from "./clarity-provider";

const storedMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: z.enum(["user", "clarity"]),
  content: z.string(),
  created_at: z.string(),
  invocation_type: z.enum([
    "general",
    "action",
    "calendar_occurrence",
    "day",
  ]),
  subject_action_id: z.string().uuid().nullable(),
  subject_calendar_commitment_id: z.string().uuid().nullable(),
  subject_local_date: z.string().nullable(),
  response_to_message_id: z.string().uuid().nullable(),
  model_provider: z.string().nullable(),
  model_version: z.string().nullable(),
  next_move_type: z.string().nullable(),
  structured_metadata: z.unknown().nullable(),
});

type StoredClarityConversationMessage = z.infer<typeof storedMessageSchema>;

export type ClarityConversationMessage = StoredClarityConversationMessage & {
  attachments: ClarityMessageAttachment[];
  proposal: ClarityChangeProposal | null;
};

export type ClarityConversation = {
  id: string | null;
  messages: ClarityConversationMessage[];
};

export async function loadClarityConversation(
  limit = 40,
): Promise<ClarityConversation> {
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  const { data: conversation, error: conversationError } = await supabase
    .from("clarity_conversations")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  if (!conversation) return { id: null, messages: [] };

  const { data, error } = await supabase
    .from("clarity_messages")
    .select(
      "id, conversation_id, role, content, created_at, invocation_type, subject_action_id, subject_calendar_commitment_id, subject_local_date, response_to_message_id, model_provider, model_version, next_move_type, structured_metadata",
    )
    .eq("user_id", user.id)
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 80));
  if (error) throw new Error(error.message);

  const storedMessages = storedMessageSchema.array().parse(data ?? []).reverse();
  const [attachments, proposals] = await Promise.all([
    loadClarityAttachmentsForMessages(
      storedMessages.map((message) => message.id),
    ),
    loadClarityProposalsForAssistantMessages(
      storedMessages
        .filter((message) => message.role === "clarity")
        .map((message) => message.id),
    ),
  ]);

  return {
    id: conversation.id,
    messages: storedMessages.map((message) => ({
      ...message,
      attachments: attachments.get(message.id) ?? [],
      proposal: proposals.get(message.id) ?? null,
    })),
  };
}

export async function appendClarityUserMessage(
  content: string,
  invocation: ClarityInvocationDescriptor,
  attachmentIds: string[] = [],
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc(
    "append_clarity_user_message_v2",
    {
      p_content: content,
      p_invocation_type: invocation.type,
      p_attachment_ids: attachmentIds,
      ...(invocation.actionId
        ? { p_subject_action_id: invocation.actionId }
        : {}),
      ...(invocation.calendarCommitmentId
        ? {
            p_subject_calendar_commitment_id:
              invocation.calendarCommitmentId,
          }
        : {}),
      ...(invocation.localDate
        ? { p_subject_local_date: invocation.localDate }
        : {}),
    },
  );
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error("Clarity message was not saved.");
  return result;
}

export async function appendClarityResponse(
  userMessageId: string,
  response: ClarityConversationResponse,
  providerResult: ClarityProviderResult,
  proposalCandidate: ValidatedClarityProposalCandidate | null = null,
) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const metadata = {
    understanding: response.understanding,
    uncertainties: response.uncertainties,
    requiresCurrentVerification: response.requiresCurrentVerification,
    verificationNeed: response.verificationNeed,
    repairedStructuredOutput: providerResult.repaired,
    research: providerResult.research ?? {
      used: false,
      sources: [],
      sourceCount: 0,
      toolCallCount: 0,
      latencyMs: 0,
    },
  } satisfies Json;
  const memoryCandidate = proposalCandidate?.type === "memory_update"
    ? proposalCandidate
    : null;
  const actionCandidate = proposalCandidate?.type === "action_create"
    ? proposalCandidate
    : null;
  const { data, error } = await supabase.rpc("append_clarity_response_v3", {
    p_user_message_id: userMessageId,
    p_content: response.response,
    p_model_provider: providerResult.provider,
    p_model_version: providerResult.model,
    p_next_move_type: response.nextMove.type,
    p_structured_metadata: metadata,
    p_latency_ms: providerResult.latencyMs,
    p_proposal_type: proposalCandidate?.type,
    p_target_memory_item_id: memoryCandidate?.targetMemoryItemId,
    p_replacement_statement: memoryCandidate?.replacementStatement,
    p_effective_on: memoryCandidate?.effectiveOn ?? undefined,
    p_proposal_summary: proposalCandidate?.summary,
    p_proposal_rationale: proposalCandidate?.rationale,
    p_action_title: actionCandidate?.title,
    p_action_local_date: actionCandidate?.actionLocalDate,
    p_action_due_local_date: actionCandidate?.dueLocalDate ?? undefined,
    p_action_due_local_time: actionCandidate?.dueLocalTime ?? undefined,
    p_action_estimated_minutes:
      actionCandidate?.durationMinutes ?? undefined,
    ...(providerResult.usage.inputTokens === null
      ? {}
      : { p_input_tokens: providerResult.usage.inputTokens }),
    ...(providerResult.usage.outputTokens === null
      ? {}
      : { p_output_tokens: providerResult.usage.outputTokens }),
  });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export async function loadRetryableUserMessage(messageId: string) {
  const parsedId = z.string().uuid().parse(messageId);
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase
    .from("clarity_messages")
    .select(
      "id, conversation_id, role, content, created_at, invocation_type, subject_action_id, subject_calendar_commitment_id, subject_local_date, response_to_message_id, model_provider, model_version, next_move_type, structured_metadata",
    )
    .eq("id", parsedId)
    .eq("user_id", user.id)
    .eq("role", "user")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Message not found.");

  const { data: existingResponse, error: responseError } = await supabase
    .from("clarity_messages")
    .select("id")
    .eq("response_to_message_id", parsedId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (responseError) throw new Error(responseError.message);

  const message = storedMessageSchema.parse(data);
  const attachments = await loadClarityAttachmentsForMessages([message.id]);

  return {
    message: {
      ...message,
      attachments: attachments.get(message.id) ?? [],
      proposal: null,
    },
    alreadyAnswered: Boolean(existingResponse),
  };
}

export function descriptorFromStoredMessage(
  message: Pick<
    Tables<"clarity_messages">,
    | "invocation_type"
    | "subject_action_id"
    | "subject_calendar_commitment_id"
    | "subject_local_date"
  >,
): ClarityInvocationDescriptor {
  return {
    type: message.invocation_type as ClarityInvocationDescriptor["type"],
    actionId: message.subject_action_id,
    calendarCommitmentId: message.subject_calendar_commitment_id,
    localDate: message.subject_local_date,
  };
}
