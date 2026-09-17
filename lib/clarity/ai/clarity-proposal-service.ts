import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";
import { getAuthenticatedUserAndProfile } from "../daily-loop-queries";
import {
  clarityMemoryUpdateProposalSchema,
  type ClarityMemoryUpdateProposal,
  type ClarityProposalContext,
} from "./clarity-proposal";

const proposalRowSchema = z.object({
  id: z.string().uuid(),
  source_assistant_message_id: z.string().uuid(),
  status: z.enum([
    "proposed",
    "dismissed",
    "expired",
    "executed",
    "execution_failed",
  ]),
  summary: z.string(),
  rationale: z.string(),
  revision: z.number().int().positive(),
  confirmed_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
  expired_at: z.string().nullable(),
  executed_at: z.string().nullable(),
  execution_failure_code: z.string().nullable(),
  dismissal_reason: z.string().nullable(),
});

const detailRowSchema = z.object({
  proposal_id: z.string().uuid(),
  target_memory_item_id: z.string().uuid(),
  target_statement: z.string(),
  replacement_statement: z.string(),
  effective_on: z.string().nullable(),
  result_memory_item_id: z.string().uuid().nullable(),
});

const dismissedRowSchema = z.object({
  id: z.string().uuid(),
  source_user_message_id: z.string().uuid(),
  summary: z.string(),
  dismissed_at: z.string(),
});

const dismissedDetailSchema = z.object({
  proposal_id: z.string().uuid(),
  target_memory_item_id: z.string().uuid(),
  target_statement: z.string(),
  replacement_statement: z.string(),
});

export async function loadClarityProposalsForAssistantMessages(
  assistantMessageIds: string[],
): Promise<Map<string, ClarityMemoryUpdateProposal>> {
  if (assistantMessageIds.length === 0) return new Map();
  const { supabase, user } = await getAuthenticatedUserAndProfile();
  const { data: proposalRows, error: proposalError } = await supabase
    .from("clarity_change_proposals")
    .select(
      "id, source_assistant_message_id, status, summary, rationale, revision, confirmed_at, dismissed_at, expired_at, executed_at, execution_failure_code, dismissal_reason",
    )
    .eq("user_id", user.id)
    .eq("proposal_type", "memory_update")
    .in("source_assistant_message_id", assistantMessageIds);
  if (proposalError) throw new Error(proposalError.message);

  const proposals = proposalRowSchema.array().parse(proposalRows ?? []);
  if (proposals.length === 0) return new Map();
  const { data: detailRows, error: detailError } = await supabase
    .from("clarity_memory_update_proposals")
    .select(
      "proposal_id, target_memory_item_id, target_statement, replacement_statement, effective_on, result_memory_item_id",
    )
    .eq("user_id", user.id)
    .in(
      "proposal_id",
      proposals.map((proposal) => proposal.id),
    );
  if (detailError) throw new Error(detailError.message);

  const details = new Map(
    detailRowSchema
      .array()
      .parse(detailRows ?? [])
      .map((detail) => [detail.proposal_id, detail]),
  );

  return new Map(
    proposals.flatMap((proposal) => {
      const detail = details.get(proposal.id);
      if (!detail) return [];
      const value = clarityMemoryUpdateProposalSchema.parse({
        id: proposal.id,
        sourceAssistantMessageId: proposal.source_assistant_message_id,
        status: proposal.status,
        summary: proposal.summary,
        rationale: proposal.rationale,
        revision: proposal.revision,
        confirmedAt: proposal.confirmed_at,
        dismissedAt: proposal.dismissed_at,
        expiredAt: proposal.expired_at,
        executedAt: proposal.executed_at,
        executionFailureCode: proposal.execution_failure_code,
        dismissalReason: proposal.dismissal_reason,
        targetMemoryItemId: detail.target_memory_item_id,
        targetStatement: detail.target_statement,
        replacementStatement: detail.replacement_statement,
        effectiveOn: detail.effective_on,
        resultMemoryItemId: detail.result_memory_item_id,
      });
      return [[proposal.source_assistant_message_id, value] as const];
    }),
  );
}

export async function loadClarityProposalContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ClarityProposalContext> {
  const { data: proposalRows, error: proposalError } = await supabase
    .from("clarity_change_proposals")
    .select("id, source_user_message_id, summary, dismissed_at")
    .eq("user_id", userId)
    .eq("proposal_type", "memory_update")
    .eq("status", "dismissed")
    .order("dismissed_at", { ascending: false })
    .limit(6);
  if (proposalError) throw new Error(proposalError.message);

  const proposals = dismissedRowSchema.array().parse(proposalRows ?? []);
  if (proposals.length === 0) {
    return { recentDismissedMemoryUpdates: [] };
  }
  const { data: detailRows, error: detailError } = await supabase
    .from("clarity_memory_update_proposals")
    .select(
      "proposal_id, target_memory_item_id, target_statement, replacement_statement",
    )
    .eq("user_id", userId)
    .in(
      "proposal_id",
      proposals.map((proposal) => proposal.id),
    );
  if (detailError) throw new Error(detailError.message);

  const details = new Map(
    dismissedDetailSchema
      .array()
      .parse(detailRows ?? [])
      .map((detail) => [detail.proposal_id, detail]),
  );

  return {
    recentDismissedMemoryUpdates: proposals.flatMap((proposal) => {
      const detail = details.get(proposal.id);
      return detail
        ? [
            {
              type: "memory_update" as const,
              epistemicStatus: "dismissed_unconfirmed" as const,
              sourceUserMessageId: proposal.source_user_message_id,
              summary: proposal.summary,
              targetMemoryItemId: detail.target_memory_item_id,
              targetStatementAtProposal: detail.target_statement,
              replacementStatement: detail.replacement_statement,
              dismissedAt: proposal.dismissed_at,
            },
          ]
        : [];
    }),
  };
}

export async function confirmClarityMemoryUpdateProposal(id: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc(
    "execute_clarity_memory_update_proposal_v1",
    { p_proposal_id: id },
  );
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error("Clarity could not apply this Memory update.");
  if (result.status === "execution_failed") {
    throw new Error("Clarity could not apply this Memory update. Try again.");
  }
  if (result.status === "expired") {
    throw new Error("This update is out of date. Ask Clarity to review it again.");
  }
  return result;
}

export async function editClarityMemoryUpdateProposal(input: {
  id: string;
  expectedRevision: number;
  replacementStatement: string;
  effectiveOn: string | null;
}) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc(
    "edit_clarity_memory_update_proposal_v1",
    {
      p_proposal_id: input.id,
      p_expected_revision: input.expectedRevision,
      p_replacement_statement: input.replacementStatement,
      p_effective_on: input.effectiveOn ?? undefined,
    },
  );
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error("Clarity could not edit this proposal.");
  if (result.status === "expired") {
    throw new Error("This update is out of date. Ask Clarity to review it again.");
  }
  return result;
}

export async function dismissClarityChangeProposal(id: string) {
  const { supabase } = await getAuthenticatedUserAndProfile();
  const { data, error } = await supabase.rpc(
    "dismiss_clarity_change_proposal_v1",
    { p_proposal_id: id },
  );
  if (error) throw new Error(error.message);
  return data;
}
