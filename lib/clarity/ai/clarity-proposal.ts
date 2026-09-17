import { z } from "zod";

import type { ClarityMemoryContext } from "./clarity-memory";
import {
  clarityMemoryUpdateCandidateSchema,
  type ClarityMemoryUpdateCandidate,
} from "./clarity-response-schema.ts";

export const clarityProposalStatuses = [
  "proposed",
  "dismissed",
  "expired",
  "executed",
  "execution_failed",
] as const;

export const clarityMemoryUpdateProposalSchema = z
  .object({
    id: z.string().uuid(),
    sourceAssistantMessageId: z.string().uuid(),
    status: z.enum(clarityProposalStatuses),
    summary: z.string(),
    rationale: z.string(),
    revision: z.number().int().positive(),
    confirmedAt: z.string().nullable(),
    dismissedAt: z.string().nullable(),
    expiredAt: z.string().nullable(),
    executedAt: z.string().nullable(),
    executionFailureCode: z.string().nullable(),
    dismissalReason: z.string().nullable(),
    targetMemoryItemId: z.string().uuid(),
    targetStatement: z.string(),
    replacementStatement: z.string(),
    effectiveOn: z.iso.date().nullable(),
    resultMemoryItemId: z.string().uuid().nullable(),
  })
  .strict();

export type ClarityMemoryUpdateProposal = z.infer<
  typeof clarityMemoryUpdateProposalSchema
>;

export type ClarityRecentDismissedProposal = {
  type: "memory_update";
  epistemicStatus: "dismissed_unconfirmed";
  sourceUserMessageId: string;
  summary: string;
  targetMemoryItemId: string;
  targetStatementAtProposal: string;
  replacementStatement: string;
  dismissedAt: string;
};

export type ClarityProposalContext = {
  recentDismissedMemoryUpdates: ClarityRecentDismissedProposal[];
};

export class ClarityProposalCandidateError extends Error {
  constructor(message = "Clarity returned an unavailable proposal target.") {
    super(message);
    this.name = "ClarityProposalCandidateError";
  }
}

export function validateClarityMemoryUpdateCandidate(
  candidate: ClarityMemoryUpdateCandidate | null,
  memory: ClarityMemoryContext,
) {
  if (candidate === null) return null;
  const parsed = clarityMemoryUpdateCandidateSchema.parse(candidate);
  const suppliedTargets = [
    ...memory.currentState,
    ...memory.staleCurrentState,
  ];
  const target = suppliedTargets.find(
    (item) => item.id === parsed.targetMemoryItemId,
  );

  if (!target || target.memoryClass !== "current_state") {
    throw new ClarityProposalCandidateError();
  }
  if (
    target.statement.trim().toLowerCase() ===
    parsed.replacementStatement.trim().toLowerCase()
  ) {
    throw new ClarityProposalCandidateError(
      "Clarity returned a proposal that does not change Current State.",
    );
  }

  return parsed;
}

export function formatClarityProposalEffectiveDate(
  effectiveOn: string | null,
) {
  if (!effectiveOn) return null;
  const [year, month, day] = effectiveOn.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
